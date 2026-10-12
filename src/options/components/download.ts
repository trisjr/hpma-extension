// Tải file từ chuỗi bằng Blob + <a download>; không cần quyền `downloads`.
export default function downloadText(
  filename: string,
  text: string,
  mime: string
): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Thu hồi chậm: thu hồi ngay có thể huỷ tải ở Firefox.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
