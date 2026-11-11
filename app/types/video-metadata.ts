export type MetadataStatus = "processing" | "ready" | "unavailable" | "error";
export type MetadataReason = "" | "instagram" | "unsupported" | "not_found" | "temporary";

export type VideoMetadata = {
  technique_id: string;
  user_id: string;
  status: MetadataStatus;
  reason: MetadataReason;
  title: string;
  author: string;
  thumbnail_url: string;
  attempted_at: string;
  retry_at: string;
};

export type MetadataResult = Pick<VideoMetadata,
  "title" | "author" | "thumbnail_url" | "reason"> & {
  status: Exclude<MetadataStatus, "processing">;
};

export type MetadataClaim = {
  claimed: boolean;
  metadata: VideoMetadata;
  url?: string;
  token?: string;
};

// Se verifica también al mostrar datos leídos de la base de datos.
// Las miniaturas se cargan desde el proveedor, sin copiarlas a nuestro servidor.
export function safeThumbnail(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
    const domains = ["ytimg.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com",
      "muscdn.com", "byteimg.com", "ibytedtos.com", "tiktokv.com", "cdninstagram.com", "fbcdn.net"];
    return domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url.href : "";
  } catch { return ""; }
}

export function metadataMessage(item?: VideoMetadata): string {
  if (!item) return "Vista previa pendiente.";
  if (item.status === "processing") return "Buscando información del video…";
  if (item.status === "error") return "No pudimos consultar la vista previa. El enlace sigue guardado.";
  if (item.reason === "instagram") return "La APK actualizada puede obtener la portada y los datos de Instagram en tu teléfono.";
  if (item.reason === "unsupported") return "Enlace guardado. Esta fuente aún no tiene vista previa automática.";
  if (item.status === "unavailable") return "El proveedor no entregó una vista previa. Puedes abrir el enlace original.";
  return "";
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) return "";
  const total = Math.max(1, Math.floor(seconds));
  const minutes = Math.floor(total / 60), rest = String(total % 60).padStart(2, "0");
  return minutes < 60 ? `${minutes}:${rest}` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${rest}`;
}
