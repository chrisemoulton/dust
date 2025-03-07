import { Menu, Transition } from "@headlessui/react";
import React, {
  ComponentType,
  Fragment,
  MutableRefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { ChevronDown, ChevronUpDown } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";
import { Item as StandardItem } from "./Item";
import { Tooltip, TooltipProps } from "./Tooltip";

const ButtonRefContext =
  React.createContext<MutableRefObject<HTMLButtonElement | null> | null>(null);

const labelClasses = {
  base: "s-text-element-900 s-inline-flex s-transition-colors s-ease-out s-duration-400 s-box-border s-gap-x-2 s-select-none",
  hover: "group-hover:s-text-action-500",
  active: "active:s-text-action-700",
  dark: {
    base: "dark:s-text-element-900-dark",
    hover: "dark:group-hover:s-text-action-400",
    active: "dark:active:s-text-action-600",
    disabled: "dark:s-element-500-dark",
  },
  disabled: "s-opacity-50",
};

const iconClasses = {
  base: "s-text-element-700 s-transition-colors s-ease-out s-duration-400",
  hover: "group-hover:s-text-action-500",
  active: "active:s-text-action-700",
  disabled: "s-opacity-50",
  dark: {
    base: "dark:s-text-element-700-dark",
    hover: "dark:group-hover:s-text-action-500-dark",
    active: "dark:active:s-text-action-600",
  },
};

const chevronClasses = {
  base: "s-text-element-600 s-mt-0.5",
  hover: "group-hover:s-text-action-400",
  disabled: "s-element-500",
  dark: {
    base: "dark:s-text-element-600-dark",
    hover: "dark:group-hover:s-text-action-500-dark",
    disabled: "dark:s-element-500-dark",
  },
};

export interface DropdownMenuProps {
  className?: string;
  children: React.ReactNode;
}

export function DropdownMenu({ children, className = "" }: DropdownMenuProps) {
  const buttonRef = useRef(null);
  return (
    <ButtonRefContext.Provider value={buttonRef}>
      <Menu
        as="div"
        className={classNames(className, "s-relative s-inline-block")}
      >
        {children}
      </Menu>
    </ButtonRefContext.Provider>
  );
}

export interface DropdownButtonProps {
  label?: string;
  type?: "menu" | "select";
  tooltip?: string;
  tooltipPosition?: TooltipProps["position"];
  icon?: ComponentType;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

DropdownMenu.Button = function ({
  label,
  type = "menu",
  tooltip,
  icon,
  children,
  tooltipPosition = "above",
  className = "",
  disabled = false,
}: DropdownButtonProps) {
  const finalLabelClasses = classNames(
    labelClasses.base,
    labelClasses.dark.base,
    !disabled ? labelClasses.active : "",
    !disabled ? labelClasses.dark.active : "",
    !disabled ? labelClasses.hover : "",
    !disabled ? labelClasses.dark.hover : "",
    disabled ? labelClasses.disabled : ""
  );

  const finalIconClasses = classNames(
    iconClasses.base,
    iconClasses.dark.base,
    !disabled ? iconClasses.hover : "",
    !disabled ? iconClasses.dark.hover : "",
    disabled ? iconClasses.disabled : ""
  );

  const finalChevronClasses = classNames(
    chevronClasses.base,
    !disabled ? chevronClasses.hover : "",
    chevronClasses.dark.base,
    !disabled ? chevronClasses.dark.hover : "",
    disabled ? chevronClasses.disabled : ""
  );

  const buttonRef = useContext(ButtonRefContext);

  if (children) {
    return (
      <Menu.Button
        as="div"
        disabled={disabled}
        ref={buttonRef}
        className={classNames(
          disabled ? "s-cursor-default" : "s-cursor-pointer",
          className,
          "s-group s-flex s-justify-items-center s-text-sm s-font-medium focus:s-outline-none focus:s-ring-0",
          label ? "s-gap-1.5" : "s-gap-0"
        )}
      >
        {tooltip ? (
          <Tooltip position={tooltipPosition} label={tooltip}>
            {children}
          </Tooltip>
        ) : (
          children
        )}
      </Menu.Button>
    );
  }

  return (
    <>
      {tooltip ? (
        <Tooltip label={tooltip} position={tooltipPosition}>
          <Menu.Button
            disabled={disabled}
            ref={buttonRef}
            className={classNames(
              disabled ? "s-cursor-default" : "s-cursor-pointer",
              className,
              "s-group s-flex s-justify-items-center s-text-sm s-font-medium focus:s-outline-none focus:s-ring-0",
              label ? "s-gap-1.5" : "s-gap-0"
            )}
          >
            <Icon visual={icon} size="sm" className={finalIconClasses} />
            <Icon
              visual={type === "select" ? ChevronUpDown : ChevronDown}
              size="xs"
              className={finalChevronClasses}
            />
          </Menu.Button>
        </Tooltip>
      ) : (
        <Menu.Button
          disabled={disabled}
          ref={buttonRef}
          className={classNames(
            disabled ? "s-cursor-default" : "s-cursor-pointer",
            className,
            "s-group s-flex s-justify-items-center s-text-sm s-font-medium focus:s-outline-none focus:s-ring-0",
            label ? "s-gap-1.5" : "s-gap-0"
          )}
        >
          <Icon visual={icon} size="sm" className={finalIconClasses} />
          <span className={finalLabelClasses}>{label}</span>
          <Icon
            visual={type === "select" ? ChevronUpDown : ChevronDown}
            size="xs"
            className={finalChevronClasses}
          />
        </Menu.Button>
      )}
    </>
  );
};

interface DropdownItemProps {
  label: string;
  href?: string;
  disabled?: boolean;
  visual?: string | React.ReactNode;
  onClick?: () => void;
}

DropdownMenu.Item = function ({
  label,
  href,
  disabled,
  visual,
  onClick,
}: DropdownItemProps) {
  return (
    // need to use as="div" -- otherwise we get a "forwardRef" error in the console
    <Menu.Item disabled={disabled} as="div">
      <StandardItem
        className="s-w-full s-px-4"
        variant="dropdown"
        size="md"
        href={href}
        onClick={onClick}
        label={label}
        visual={visual}
      />
    </Menu.Item>
  );
};

interface DropdownItemsProps {
  origin?: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "auto";
  width?: number;
  children: React.ReactNode;
}

DropdownMenu.Items = function ({
  origin = "auto",
  width = 160,
  children,
}: DropdownItemsProps) {
  const buttonRef = useContext(ButtonRefContext);
  const [buttonHeight, setButtonHeight] = useState(0);

  if (origin === "auto") {
    origin = findOriginFromButton(buttonRef);
  }
  useEffect(() => {
    if (buttonRef && buttonRef.current) {
      setButtonHeight(buttonRef.current.offsetHeight);
    }
  }, []);
  const getOriginClass = (origin: string) => {
    switch (origin) {
      case "topLeft":
        return `s-origin-top-left s-left-0`;
      case "topRight":
        return `s-origin-top-right s-right-0`;
      case "bottomLeft":
        return "s-origin-bottom-left s-left-0 s-bottom-6";
      case "bottomRight":
        return "s-origin-bottom-right s-right-0 s-bottom-6";
      default:
        return "s-origin-top-right";
    }
  };

  const getOriginTransClass = (origin: string) => {
    switch (origin) {
      case "topLeft":
        return "s-transform s-opacity-0 s-scale-95 -s-translate-y-5";
      case "topRight":
        return "s-transform s-opacity-0 s-scale-95 -s-translate-y-5";
      case "bottomLeft":
        return "s-transform s-opacity-0 s-scale-95 s-translate-y-5";
      case "bottomRight":
        return "s-transform s-opacity-0 s-scale-95 s-translate-y-5";
      default:
        return "s-origin-top-right";
    }
  };

  const styleInsert = (origin: string) => {
    switch (origin) {
      case "topLeft":
        return { width: `${width}px`, top: `${buttonHeight + 8}px` };
      case "topRight":
        return { width: `${width}px`, top: `${buttonHeight + 8}px` };
      default:
        return { width: `${width}px` };
    }
  };

  return (
    <Transition
      as={Fragment}
      enter="s-transition s-ease-out s-duration-200"
      enterFrom={getOriginTransClass(origin)}
      enterTo="s-transform s-opacity-100 s-scale-100 s-translate-y-0"
      leave="s-transition s-ease-in s-duration-75"
      leaveFrom="s-transform s-opacity-100 s-scale-100 s-translate-y-0"
      leaveTo={getOriginTransClass(origin)}
    >
      <Menu.Items
        className={`s-absolute s-z-10 ${getOriginClass(
          origin
        )} s-rounded-xl s-border s-border-structure-100 s-bg-structure-0 s-shadow-lg focus:s-outline-none dark:s-border-structure-100-dark dark:s-bg-structure-0-dark`}
        style={styleInsert(origin)}
      >
        <StandardItem.List>{children}</StandardItem.List>
      </Menu.Items>
    </Transition>
  );
};

function findOriginFromButton(
  buttonRef: MutableRefObject<HTMLButtonElement | null> | null
) {
  if (!buttonRef) {
    return "topRight";
  }
  const buttonRect = buttonRef.current?.getBoundingClientRect();
  if (!buttonRect) {
    return "topRight";
  }
  const windowHeight = window.innerHeight;
  // Top half of screen
  if (buttonRect.top < windowHeight / 2) {
    return buttonRect.left < window.innerWidth / 2 ? "topLeft" : "topRight";
  }
  // Bottom half of screen
  return buttonRect.left < window.innerWidth / 2 ? "bottomLeft" : "bottomRight";
}
