/**
 * surfaces.ts — trang BM mà một flow cần đứng trên đó. Panel dùng để tự điều
 * hướng tab khi mở flow; flow dùng cùng predicate để kiểm lại (phòng thủ chiều sâu),
 * nên hai bên không bao giờ lệch định nghĩa "đúng trang".
 */

export type Surface = 'settings';

const BM_ORIGIN = 'https://business.facebook.com';
const BUSINESS_ID = /^\d{1,30}$/;

type SurfaceDef = {
  // Đường dẫn cố định (allowlist) dùng để dựng URL đích.
  path: string;
  match: (pathname: string) => boolean;
};

const SURFACES: Record<Surface, SurfaceDef> = {
  settings: {
    path: '/latest/settings',
    match: (pathname) => pathname.includes('/settings'),
  },
};

export function isOnSurface(surface: Surface, pathname: string): boolean {
  return SURFACES[surface].match(pathname);
}

// URL đích: origin + path cố định + business_id đã kiểm số. Thiếu/sai ID thì không
// dựng, để không bao giờ rơi vào BM mặc định khác BM đang chọn TKQC.
export function surfaceUrl(
  surface: Surface,
  businessId: string | undefined
): string | undefined {
  if (!businessId || !BUSINESS_ID.test(businessId)) return undefined;
  const url = new URL(SURFACES[surface].path, BM_ORIGIN);
  url.searchParams.set('business_id', businessId);
  return url.toString();
}

export function isBusinessId(value: unknown): value is string {
  return typeof value === 'string' && BUSINESS_ID.test(value);
}
