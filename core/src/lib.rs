#[macro_use]
extern crate pest_derive;

#[derive(Parser)]
#[grammar = "dust.pest"]
pub struct DustParser;

pub mod stores {
    pub mod postgres;
    pub mod store;
}
pub mod app;
pub mod dataset;
pub mod data_sources {
    pub mod data_source;
    pub mod splitter;
}
pub mod databases {
    pub mod table_schema;
}
pub mod project;
pub mod run;
pub mod utils;
pub mod providers {
    pub mod ai21;
    pub mod azure_openai;
    pub mod cohere;
    pub mod embedder;
    pub mod llm;
    pub mod openai;
    pub mod provider;
    pub mod tiktoken {
        pub mod tiktoken;
    }
    pub mod anthropic;
    pub mod textsynth;
}
pub mod http {
    pub mod request;
}
pub mod blocks {
    pub mod block;
    pub mod browser;
    pub mod chat;
    pub mod code;
    pub mod curl;
    pub mod data;
    pub mod data_source;
    pub mod end;
    pub mod input;
    pub mod llm;
    pub mod map;
    pub mod reduce;
    pub mod search;
    pub mod r#while;
}

pub mod deno {
    pub mod script;
}

pub mod consts;
