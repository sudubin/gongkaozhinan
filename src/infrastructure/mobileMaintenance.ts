import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

const KEY = "gongkao.mobile-provider.v1";
export interface MobileProviderConfig { baseUrl: string; model: string; apiKey: string; timeoutMs: number; dailyHour: number; enabled: boolean }
export interface MobileProviderPublic { baseUrl: string; model: string; timeoutMs: number; dailyHour: number; enabled: boolean; keyConfigured: boolean }
export class MobileMaintenanceError extends Error { constructor(public readonly code: string, message: string) { super(message); } }

const validate = (value: MobileProviderConfig) => {
  let url: URL; try { url = new URL(value.baseUrl.trim()); } catch { throw new MobileMaintenanceError("invalid_base_url", "API 地址无效"); }
  if (url.protocol !== "https:") throw new MobileMaintenanceError("https_required", "API 地址必须使用 HTTPS");
  if (!value.model.trim() || !value.apiKey.trim()) throw new MobileMaintenanceError("missing_config", "模型 ID 和 API 密钥不能为空");
  if (!Number.isInteger(value.timeoutMs) || value.timeoutMs < 1000 || value.timeoutMs > 120000) throw new MobileMaintenanceError("invalid_timeout", "超时须为 1000–120000 毫秒");
  if (!Number.isInteger(value.dailyHour) || value.dailyHour < 0 || value.dailyHour > 23) throw new MobileMaintenanceError("invalid_schedule", "每日时间须为 0–23 点");
  return { ...value, baseUrl: url.href.replace(/\/$/, ""), model: value.model.trim(), apiKey: value.apiKey.trim() };
};

const nativeOnly = () => { if (!Capacitor.isNativePlatform()) throw new MobileMaintenanceError("native_only", "API 密钥只允许在已安装的 Android App 中保存"); };
export async function saveMobileProvider(input: MobileProviderConfig): Promise<MobileProviderPublic> { nativeOnly(); const value = validate(input); await SecureStorage.set(KEY, value); return publicConfig(value); }
export async function readMobileProvider(): Promise<MobileProviderConfig | null> { nativeOnly(); return await SecureStorage.get(KEY) as MobileProviderConfig | null; }
export const publicConfig = (value: MobileProviderConfig): MobileProviderPublic => ({ baseUrl: value.baseUrl, model: value.model, timeoutMs: value.timeoutMs, dailyHour: value.dailyHour, enabled: value.enabled, keyConfigured: Boolean(value.apiKey) });
export async function clearMobileProvider() { nativeOnly(); await SecureStorage.remove(KEY); }
export async function testMobileProvider(config: MobileProviderConfig): Promise<{ model: string }> {
  const value = validate(config);
  try {
    const response = await CapacitorHttp.post({ url: `${value.baseUrl}/chat/completions`, headers: { authorization: `Bearer ${value.apiKey}`, "content-type": "application/json" }, data: { model: value.model, messages: [{ role: "user", content: "仅回复 OK" }], max_tokens: 8, temperature: 0 }, connectTimeout: value.timeoutMs, readTimeout: value.timeoutMs });
    if (response.status === 401 || response.status === 403) throw new MobileMaintenanceError("authentication_failed", "API 密钥无效或无权访问");
    if (response.status < 200 || response.status >= 300) throw new MobileMaintenanceError("provider_rejected", `模型服务拒绝请求（HTTP ${response.status}）`);
    const body = response.data as { model?: string; choices?: Array<{ message?: { content?: string } }> };
    if (!body.choices?.[0]?.message?.content) throw new MobileMaintenanceError("invalid_response", "模型服务响应无有效文本");
    return { model: body.model ?? value.model };
  } catch (error) {
    if (error instanceof MobileMaintenanceError) throw error;
    if ((error as Error).name === "AbortError") throw new MobileMaintenanceError("timeout", "连接测试超时");
    throw new MobileMaintenanceError("unreachable", "无法连接模型服务");
  } finally { /* native HTTP owns its timeout */ }
}
