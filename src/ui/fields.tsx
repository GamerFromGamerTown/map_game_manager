import { ReactNode } from "react";

export const asNumber = (value: string): number => Number(value || 0);

export const formatSigned = (value: number): string => `${value >= 0 ? "+" : ""}${Math.round(value)}`;

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  id
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  id?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(asNumber(event.target.value))}
      />
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  id
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  id
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
}) {
  return (
    <label className="check-field">
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  optionLabel,
  id
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  optionLabel?: (value: string) => string;
  id?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option} key={option}>
            {optionLabel ? optionLabel(option) : option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  footer
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer: ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-title">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}
