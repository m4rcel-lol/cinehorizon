import { jsx as _jsx } from "react/jsx-runtime";
export function Button({ children, ...props }) {
    return _jsx("button", { className: `ch-button ${props.className ?? ''}`.trim(), ...props, children: children });
}
export function Badge({ children }) {
    return _jsx("span", { className: "ch-badge", children: children });
}
export function Skeleton({ className = '' }) {
    return _jsx("div", { className: `ch-skeleton ${className}`.trim() });
}
