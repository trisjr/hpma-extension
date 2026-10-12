import { JSX } from 'react';

type NumberFieldProps = {
  id: string;
  // Có `label` thì dựng nhãn hiện; không thì dùng `ariaLabel` (ô trong bảng).
  label: string;
  ariaLabel: string;
  value: string;
  unit: string;
  // Thông điệp dưới ô: lỗi (đỏ) thay chú thích.
  message: string;
  invalid: boolean;
  integer: boolean;
  onChange: (value: string) => void;
};

// Ô nhập dạng chữ để gõ được cả `,` và `.`; validate ở form (SPEC-UI-004 §3.1).
export default function NumberField({
  id,
  label,
  ariaLabel,
  value,
  unit,
  message,
  invalid,
  integer,
  onChange,
}: NumberFieldProps): JSX.Element {
  const messageId = `${id}-msg`;
  const box = (
    <span
      className={`flex h-10 items-center rounded-md bg-base-100 ${
        invalid ? 'border-2 border-red-600' : 'border-base-content/20 border'
      }`}
    >
      <input
        id={id}
        type='text'
        inputMode={integer ? 'numeric' : 'decimal'}
        value={value}
        aria-label={label === '' ? ariaLabel : undefined}
        aria-invalid={invalid}
        aria-describedby={message === '' ? undefined : messageId}
        onChange={(event) => onChange(event.target.value)}
        className='h-9 min-w-0 flex-1 border-0 bg-transparent px-3 text-[15px] outline-none'
      />
      {unit !== '' && (
        <span className='text-base-content/70 pr-3 text-sm'>{unit}</span>
      )}
    </span>
  );

  return (
    <div className='flex flex-col gap-1'>
      {label === '' ? (
        box
      ) : (
        <label htmlFor={id} className='flex flex-col gap-1'>
          <span className='text-sm font-medium'>{label}</span>
          {box}
        </label>
      )}
      {message !== '' && (
        <span
          id={messageId}
          className={`text-xs ${
            invalid ? 'text-red-700 dark:text-red-300' : 'text-base-content/70'
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
