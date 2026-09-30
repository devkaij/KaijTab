/** 按需申请主机权限：只授权用户自己填写的那个域名（需要用户手势触发）。 */

export function permissionOriginFor(rawUrl: string): string | null {
  try {
    return `${new URL(rawUrl).origin}/*`;
  } catch {
    return null;
  }
}

export function hasHostPermission(rawUrl: string): Promise<boolean> {
  const pattern = permissionOriginFor(rawUrl);
  if (!pattern) return Promise.resolve(false);
  return chrome.permissions.contains({ origins: [pattern] }).catch(() => false);
}

/**
 * 申请访问某个地址所属域名的权限。
 * 必须在用户手势（点击）触发的调用链里调用，否则浏览器会拒绝弹窗。
 */
export async function ensureHostPermission(rawUrl: string): Promise<{ ok: boolean; origin?: string }> {
  const pattern = permissionOriginFor(rawUrl);
  if (!pattern) return { ok: false };
  try {
    const already = await chrome.permissions.contains({ origins: [pattern] });
    if (already) return { ok: true, origin: pattern };
    const granted = await chrome.permissions.request({ origins: [pattern] });
    return { ok: granted, origin: pattern };
  } catch {
    return { ok: false, origin: pattern };
  }
}

/** 批量申请（去重，串行请求，保持用户手势有效性） */
export async function ensureHostPermissions(
  rawUrls: string[],
): Promise<{ ok: string[]; denied: string[] }> {
  const patterns = new Map<string, string>();
  for (const raw of rawUrls) {
    const pattern = permissionOriginFor(raw);
    if (pattern) patterns.set(pattern, raw);
  }
  const ok: string[] = [];
  const denied: string[] = [];
  for (const [pattern, raw] of patterns) {
    try {
      const granted = await chrome.permissions.request({ origins: [pattern] });
      if (granted) ok.push(raw);
      else denied.push(pattern);
    } catch {
      denied.push(pattern);
    }
  }
  return { ok, denied };
}
