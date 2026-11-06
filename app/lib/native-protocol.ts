export const NATIVE_PROTOCOL_VERSION = 1;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && value.length === 36 && uuid.test(value);
}

export const nativeErrors = {
  BAD_REQUEST: "La solicitud no es válida. Actualiza la aplicación y vuelve a intentarlo.",
  UNSUPPORTED_VERSION: "La web y la APK necesitan la misma versión del puente. Actualiza la aplicación.",
  UNSUPPORTED_ACTION: "Esta versión de la APK solo comprueba archivos locales.",
  AUTH_REQUIRED: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  SESSION_MISMATCH: "La cuenta cambió. Actualiza la biblioteca y vuelve a intentarlo.",
  NOT_FOUND: "Esta ficha no está disponible en tu cuenta.",
  UNAVAILABLE: "No se pudo verificar la ficha. Revisa tu conexión y vuelve a intentarlo.",
  DEPLOYMENT_UNAVAILABLE: "No se pudo acceder a la verificación de Alejandrino. Revisa el acceso al despliegue web de la APK.",
  BAD_RESPONSE: "La respuesta no corresponde a esta consulta. Vuelve a intentarlo.",
  TIMEOUT: "La comprobación tardó demasiado. Revisa tu conexión y vuelve a intentarlo.",
  CANCELLED: "Comprobación cancelada.",
  LOCAL_READ_FAILED: "No se pudo comprobar el archivo local. Revisa sus permisos y vuelve a intentarlo.",
  BUSY: "Hay otras comprobaciones en curso. Vuelve a intentarlo en unos segundos.",
  UNSUPPORTED_BRIDGE: "Esta comprobación requiere la APK de Alejandrino actualizada.",
} as const;
export type NativeErrorCode = keyof typeof nativeErrors;
export class NativeCheckError extends Error {
  constructor(public readonly code: NativeErrorCode) { super(nativeErrors[code]); }
}
export function isNativeErrorCode(value: unknown): value is NativeErrorCode {
  return typeof value === "string" && Object.hasOwn(nativeErrors, value);
}

export type CheckRequest = {
  protocolVersion: 1; requestId: string; type: "CHECK"; userId: string; techniqueId: string;
};
export type LocalVideoStatus = "missing" | "available";

export function parseCheckRequest(value: unknown): CheckRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NativeCheckError("BAD_REQUEST");
  const m = value as Record<string, unknown>;
  if (m.protocolVersion !== NATIVE_PROTOCOL_VERSION) throw new NativeCheckError("UNSUPPORTED_VERSION");
  if (m.type !== "CHECK") throw new NativeCheckError("UNSUPPORTED_ACTION");
  if (!isUuid(m.requestId) || !isUuid(m.userId) || !isUuid(m.techniqueId)) throw new NativeCheckError("BAD_REQUEST");
  return { protocolVersion: 1, type: "CHECK", requestId: m.requestId,
    userId: m.userId.toLowerCase(), techniqueId: m.techniqueId.toLowerCase() };
}
