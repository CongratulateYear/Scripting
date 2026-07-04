/**
 * 音源标签辅助：将 provider 字符串映射为 UI 显示名。
 */

const SOURCE_LABELS: Record<string, string> = {
  lxmusic: "LX Music",
  mp3juice: "MP3Juice",
  itunes_preview: "iTunes Preview",
  livepoo: "LivePoo",
  migu: "MiGu",
  qqmp3: "QQMP3",
  qq: "QQ Music",
  bugu: "Bugu",
  gequhai: "GequHai",
  gequbao: "GequBao",
}

const SOURCE_COLORS: Record<string, string> = {
  lxmusic: "systemPink",
  mp3juice: "systemBlue",
  itunes_preview: "systemPurple",
}

/** 获取音源的 UI 显示名（未知 provider 回退到原字符串）。 */
export function sourceLabel(provider: string | undefined | null): string {
  if (!provider) return ""
  return SOURCE_LABELS[provider.trim()] ?? provider
}

/** 获取音源的标签颜色（未知 provider 回退到 tertiaryLabel）。 */
export function sourceColor(provider: string | undefined | null): string {
  if (!provider) return "tertiaryLabel"
  return SOURCE_COLORS[provider.trim()] ?? "tertiaryLabel"
}
