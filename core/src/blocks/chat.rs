use crate::blocks::block::{
    parse_pair, replace_variables_in_string, Block, BlockResult, BlockType, Env,
};
use crate::deno::script::Script;
use crate::providers::llm::{ChatFunction, ChatMessage, ChatMessageRole, LLMChatRequest};
use crate::providers::provider::ProviderID;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde::Serialize;
use serde_json::{json, Value};
use std::str::FromStr;
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};

#[derive(Clone)]
pub struct Chat {
    instructions: Option<String>,
    messages_code: String,
    functions_code: Option<String>,
    temperature: f32,
    top_p: Option<f32>,
    stop: Vec<String>,
    max_tokens: Option<i32>,
    presence_penalty: Option<f32>,
    frequency_penalty: Option<f32>,
}

impl Chat {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut instructions: Option<String> = None;
        let mut messages_code: Option<String> = None;
        let mut functions_code: Option<String> = None;
        let mut temperature: Option<f32> = None;
        let mut top_p: Option<f32> = None;
        let mut stop: Vec<String> = vec![];
        let mut max_tokens: Option<i32> = None;
        let mut frequency_penalty: Option<f32> = None;
        let mut presence_penalty: Option<f32> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "instructions" => instructions = Some(value),
                        "messages_code" => messages_code = Some(value),
                        "functions_code" => functions_code = Some(value),
                        "temperature" => match value.parse::<f32>() {
                            Ok(n) => temperature = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `temperature` in `chat` block, expecting float"
                            ))?,
                        },
                        "top_p" => match value.parse::<f32>() {
                            Ok(n) => top_p = Some(n),
                            Err(_) => {
                                Err(anyhow!("Invalid `top_p` in `chat` block, expecting float"))?
                            }
                        },
                        "max_tokens" => match value.parse::<i32>() {
                            Ok(n) => max_tokens = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `max_tokens` in `chat` block, expecting integer"
                            ))?,
                        },
                        "stop" => stop = value.split("\n").map(|s| String::from(s)).collect(),
                        "presence_penalty" => match value.parse::<f32>() {
                            Ok(n) => presence_penalty = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `presence_penalty` in `chat` block, expecting float"
                            ))?,
                        },
                        "frequency_penalty" => match value.parse::<f32>() {
                            Ok(n) => frequency_penalty = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `frequency_penalty` in `chat` block, expecting float"
                            ))?,
                        },
                        _ => Err(anyhow!("Unexpected `{}` in `chat` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!("`expected` is not yet supported in `chat` block"))?,
                _ => unreachable!(),
            }
        }

        if !temperature.is_some() {
            Err(anyhow!("Missing required `temperature` in `chat` block"))?;
        }
        if !messages_code.is_some() {
            Err(anyhow!("Missing required `messages_code` in `chat` block"))?;
        }

        Ok(Chat {
            instructions,
            messages_code: messages_code.unwrap(),
            functions_code: functions_code,
            temperature: temperature.unwrap(),
            top_p,
            stop,
            max_tokens,
            presence_penalty,
            frequency_penalty,
        })
    }

    fn replace_instructions_variables(text: &str, env: &Env) -> Result<String> {
        replace_variables_in_string(text, "instructions", env)
    }

    fn instructions(&self, env: &Env) -> Result<String> {
        let mut instructions = String::new();

        // If `instructions` is defined, replace variables in it and add it.
        if let Some(i) = &self.instructions {
            instructions.push_str(Self::replace_instructions_variables(i, env)?.as_str());
        }

        // replace <DUST_TRIPLE_BACKTICKS> with ```
        instructions = instructions.replace("<DUST_TRIPLE_BACKTICKS>", "```");
        // println!("INSTRUCTIONS: {}", instructions);

        Ok(instructions)
    }
}

#[derive(Debug, Serialize, PartialEq)]
struct ChatValue {
    message: ChatMessage,
}

#[async_trait]
impl Block for Chat {
    fn block_type(&self) -> BlockType {
        BlockType::Chat
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("chat".as_bytes());
        if let Some(instructions) = &self.instructions {
            hasher.update(instructions.as_bytes());
        }
        hasher.update(self.messages_code.as_bytes());
        if let Some(functions_code) = &self.functions_code {
            hasher.update(functions_code.as_bytes());
        }
        hasher.update(self.temperature.to_string().as_bytes());
        if let Some(top_p) = &self.top_p {
            hasher.update(top_p.to_string().as_bytes());
        }
        for s in self.stop.iter() {
            hasher.update(s.as_bytes());
        }
        if let Some(max_tokens) = &self.max_tokens {
            hasher.update(max_tokens.to_string().as_bytes());
        }
        if let Some(presence_penalty) = &self.presence_penalty {
            hasher.update(presence_penalty.to_string().as_bytes());
        }
        if let Some(frequency_penalty) = &self.frequency_penalty {
            hasher.update(frequency_penalty.to_string().as_bytes());
        }
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        name: &str,
        env: &Env,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<BlockResult> {
        let config = env.config.config_for_block(name);

        let (provider_id, model_id, temperature, function_call) = match config {
            Some(v) => {
                let provider_id = match v.get("provider_id") {
                    Some(v) => match v {
                        Value::String(s) => match ProviderID::from_str(s) {
                            Ok(p) => p,
                            Err(e) => Err(anyhow!(
                                "Invalid `provider_id` `{}` in configuration \
                                 for chat block `{}`: {}",
                                s,
                                name,
                                e
                            ))?,
                        },
                        _ => Err(anyhow!(
                            "Invalid `provider_id` in configuration for chat block `{}`: \
                             string expected",
                            name
                        ))?,
                    },
                    _ => Err(anyhow!(
                        "Missing `provider_id` in configuration for chat block `{}`",
                        name
                    ))?,
                };

                let model_id = match v.get("model_id") {
                    Some(v) => match v {
                        Value::String(s) => s.clone(),
                        _ => Err(anyhow!(
                            "Invalid `model_id` in configuration for chat block `{}`",
                            name
                        ))?,
                    },
                    _ => Err(anyhow!(
                        "Missing `model_id` in configuration for chat block `{}`",
                        name
                    ))?,
                };

                let temperature = match v.get("temperature") {
                    Some(v) => match v {
                        Value::Number(t) => match t.as_f64() {
                            Some(t) => Some(t as f32),
                            None => Err(anyhow!(
                                "Invalid `temperature` in configuration for chat block `{}`",
                                name
                            ))?,
                        },
                        _ => Err(anyhow!(
                            "Invalid `temperature` in configuration for chat block `{}`",
                            name
                        ))?,
                    },
                    _ => None,
                };

                let function_call = match v.get("function_call") {
                    Some(v) => match v {
                        Value::Null => None,
                        Value::String(s) => match s.len() {
                            0 => None,
                            _ => Some(s.clone()),
                        },
                        _ => Err(anyhow!(
                            "Invalid `function_call` in configuration for chat block `{}`",
                            name
                        ))?,
                    },
                    _ => None,
                };

                (provider_id, model_id, temperature, function_call)
            }
            _ => Err(anyhow!(
                "Missing configuration for chat block `{}`, \
                 expecting `{{ \"provider_id\": ..., \"model_id\": ... }}`",
                name
            ))?,
        };

        let use_cache = match config {
            Some(v) => match v.get("use_cache") {
                Some(v) => match v {
                    Value::Bool(b) => *b,
                    _ => true,
                },
                None => true,
            },
            None => true,
        };

        let use_stream = match config {
            Some(v) => match v.get("use_stream") {
                Some(v) => match v {
                    Value::Bool(b) => *b,
                    _ => true,
                },
                None => false,
            },
            None => false,
        } && event_sender.is_some();

        let extras = match config {
            Some(v) => match v.get("openai_user") {
                Some(v) => match v {
                    Value::String(s) => Some(json!({
                        "openai_user": s.clone(),
                    })),
                    _ => None,
                },
                None => None,
            },
            None => None,
        };

        // Process messages.
        let e = env.clone();
        let messages_code = self.messages_code.replace("<DUST_TRIPLE_BACKTICKS>", "```");
        let (messages_value, messages_logs): (Value, Vec<Value>) =
            match tokio::task::spawn_blocking(move || {
                let mut script = Script::from_string(messages_code.as_str())?
                    .with_timeout(std::time::Duration::from_secs(10));
                script.call("_fun", &e)
            })
            .await?
            {
                Ok((v, l)) => (v, l),
                Err(e) => Err(anyhow!("Error in messages code: {}", e))?,
            };

        let mut messages = match messages_value {
            Value::Array(a) => a
                .into_iter()
                .map(|v| match v {
                    Value::Object(o) => match (o.get("role"), o.get("content")) {
                        (Some(Value::String(r)), Some(Value::String(c))) => Ok(ChatMessage {
                            role: ChatMessageRole::from_str(r)?,
                            name: match o.get("name") {
                                Some(Value::String(n)) => Some(n.clone()),
                                _ => None,
                            },
                            content: Some(c.clone()),
                            function_call: None,
                        }),
                        _ => Err(anyhow!(
                            "Invalid messages code output, expecting an array of objects with
                             fields `role`, possibly `name`, and `content`."
                        )),
                    },
                    _ => Err(anyhow!(
                        "Invalid messages code output, expecting an array of objects with
                         fields `role`, possibly `name`, and `content`."
                    )),
                })
                .collect::<Result<Vec<ChatMessage>>>()?,
            _ => Err(anyhow!(
                "Invalid messages code output, expecting an array of objects with
                 fields `role`, possibly `name`, and `content`."
            ))?,
        };

        // Process functions.
        let (functions, functions_logs) = match self.functions_code.as_ref() {
            None => (vec![], vec![]),
            Some(c) => {
                let e = env.clone();
                let functions_code = c.clone().replace("<DUST_TRIPLE_BACKTICKS>", "```");
                let (functions_value, functions_logs): (Value, Vec<Value>) =
                    match tokio::task::spawn_blocking(move || {
                        let mut script = Script::from_string(functions_code.as_str())?
                            .with_timeout(std::time::Duration::from_secs(10));
                        script.call("_fun", &e)
                    })
                    .await?
                    {
                        Ok((v, l)) => (v, l),
                        Err(e) => Err(anyhow!("Error in functions code: {}", e))?,
                    };

                (
                    match functions_value {
                        Value::Null => vec![],
                        Value::Array(a) => a
                            .into_iter()
                            .map(|v| match v {
                                Value::Object(o) => {
                                    match (o.get("name"), o.get("description"), o.get("parameters"))
                                    {
                                        (
                                            Some(Value::String(n)),
                                            Some(Value::String(d)),
                                            Some(p),
                                        ) => Ok(ChatFunction {
                                            name: n.clone(),
                                            description: Some(d.clone()),
                                            parameters: Some(p.clone()),
                                        }),
                                        _ => Err(anyhow!(
                                "Invalid functions code output, expecting an array of objects with
                                 fields `name`, `description`, and `parameters`."
                            )),
                                    }
                                }
                                _ => Err(anyhow!(
                                "Invalid functions code output, expecting an array of objects with
                                 fields `name`, `description`, and `parameters`."
                            )),
                            })
                            .collect::<Result<Vec<ChatFunction>>>()?,
                        _ => Err(anyhow!(
                            "Invalid functions code output, expecting an array of objects with
                             fields `name`, `description`, and `parameters`."
                        ))?,
                    },
                    functions_logs,
                )
            }
        };

        // Validate `function_call` if present.
        match function_call.as_ref() {
            None => (),
            Some(s) => match s.as_str() {
                "auto" | "none" => (),
                s => {
                    functions.iter().find(|f| f.name == s).ok_or(anyhow!(
                        "Invalid `function_call` in configuration for chat block `{}`: \
                         function name `{}` not found in functions. Possible values are
                         'auto', 'none' or the name of one of the functions.",
                        name,
                        s
                    ))?;
                }
            },
        };

        // If instructions are provided, inject them as the first message with role `system`.
        let i = self.instructions(env)?;
        if i.len() > 0 {
            messages.insert(
                0,
                ChatMessage {
                    role: ChatMessageRole::System,
                    name: None,
                    content: Some(i),
                    function_call: None,
                },
            );
        }

        let request = LLMChatRequest::new(
            provider_id,
            &model_id,
            &messages,
            &functions,
            function_call,
            match temperature {
                Some(t) => t,
                None => self.temperature,
            },
            self.top_p,
            1,
            &self.stop,
            self.max_tokens,
            self.presence_penalty,
            self.frequency_penalty,
            extras,
        );

        let g = match use_stream {
            true => {
                let (tx, mut rx) = unbounded_channel::<Value>();
                {
                    let map = env.map.clone();
                    let input_index = env.input.index.clone();
                    let block_name = String::from(name);
                    tokio::task::spawn(async move {
                        while let Some(v) = rx.recv().await {
                            let c = v.get("content");
                            let t = v.get("type");
                            match event_sender.as_ref() {
                                Some(sender) => match t {
                                    Some(Value::String(s)) => {
                                        if s == "tokens" {
                                            let _ = sender.send(json!({
                                                "type": s,
                                                "content": {
                                                    "block_type": "chat",
                                                    "block_name": block_name,
                                                    "input_index": input_index,
                                                    "map": map,
                                                    "tokens": c,
                                                },
                                            }));
                                        }
                                        if s == "function_call" {
                                            let _ = sender.send(json!({
                                                "type": s,
                                                "content": {
                                                    "block_type": "chat",
                                                    "block_name": block_name,
                                                    "input_index": input_index,
                                                    "map": map,
                                                    "function_call": c,
                                                },
                                            }));
                                        }
                                        if s == "function_call_arguments_tokens" {
                                            let _ = sender.send(json!({
                                                "type": s,
                                                "content": {
                                                    "block_type": "chat",
                                                    "block_name": block_name,
                                                    "input_index": input_index,
                                                    "map": map,
                                                    "tokens": c,
                                                },
                                            }));
                                        }
                                    }
                                    _ => (),
                                },
                                None => (),
                            }
                        }
                        // move tx to event_sender
                    });
                }
                request.execute(env.credentials.clone(), Some(tx)).await?
            }
            false => {
                request
                    .execute_with_cache(
                        env.credentials.clone(),
                        env.project.clone(),
                        env.store.clone(),
                        use_cache,
                    )
                    .await?
            }
        };

        assert!(g.completions.len() == 1);

        let mut all_logs = messages_logs;
        all_logs.extend(functions_logs);

        Ok(BlockResult {
            value: serde_json::to_value(ChatValue {
                message: g.completions[0].clone(),
            })?,
            meta: Some(json!({
                "logs": all_logs,
            })),
        })
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
