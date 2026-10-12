import { JSX } from 'react';

type SwitchProps = {
  id: string;
  // Tên truy cập của công tắc (nhãn thẻ); `stateText` là chữ Bật/Tắt hiện bên cạnh.
  name: string;
  stateText: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
};

// Trạng thái luôn có chữ, không chỉ màu (SPEC-UI-004 §9).
export default function Switch({
  id,
  name,
  stateText,
  checked,
  disabled,
  onChange,
}: SwitchProps): JSX.Element {
  return (
    <label
      htmlFor={id}
      className='inline-flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-medium'
    >
      <input
        id={id}
        type='checkbox'
        role='switch'
        aria-label={name}
        className='toggle toggle-primary'
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className='min-w-14'>{stateText}</span>
    </label>
  );
}
