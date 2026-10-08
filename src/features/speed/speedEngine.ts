export const SPEED_ALGORITHM_VERSION = "speed-v1";
export type SpeedTrainingType = "two-digit-times-one" | "fraction-percent" | "growth-base";
export type SpeedMode = "exact" | "estimate";

export interface SpeedProblem {
  id: string;
  type: SpeedTrainingType;
  mode: SpeedMode;
  prompt: string;
  expected: string;
  unit: string;
  inputHint: string;
  explanation: string;
  parameters: Record<string, number | string>;
  algorithmVersion: string;
}

function hashSeed(seed: string): number {
  let value = 2166136261;
  for (const char of seed) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); }
  return value >>> 0;
}
function random(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
const integer = (next: () => number, min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : Math.abs(a);
export const roundHalfUp = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function generateSpeedSet(type: SpeedTrainingType, seed: string, mode: SpeedMode = "exact"): SpeedProblem[] {
  const next = random(`${SPEED_ALGORITHM_VERSION}:${type}:${seed}:${mode}`);
  return Array.from({ length: 10 }, (_, index): SpeedProblem => {
    const id = `${seed}-${index + 1}`;
    if (type === "two-digit-times-one") {
      const left = integer(next, 10, 99); const right = integer(next, 2, 9); const answer = left * right;
      return { id, type, mode: "exact", prompt: `${left} × ${right} = ?`, expected: String(answer), unit: "", inputHint: "请输入整数", explanation: `${left} × ${right} = ${answer}`, parameters: { left, right }, algorithmVersion: SPEED_ALGORITHM_VERSION };
    }
    if (type === "fraction-percent") {
      const denominators = [4, 5, 8, 10, 20, 25, 40, 50]; const denominator = denominators[integer(next, 0, denominators.length - 1)]!; const numerator = integer(next, 1, denominator - 1); const percent = roundHalfUp(numerator / denominator * 100, 1);
      if (index % 2 === 1) {
        const divisor = gcd(numerator, denominator); const fraction = `${numerator / divisor}/${denominator / divisor}`;
        return { id, type, mode: "exact", prompt: `${percent.toFixed(1)}% = ?`, expected: fraction, unit: "分数", inputHint: "输入最简分数，使用 / 分隔，例如 1/8", explanation: `${percent.toFixed(1)}% = ${numerator}/${denominator} = ${fraction}`, parameters: { numerator, denominator, precision: 1 }, algorithmVersion: SPEED_ALGORITHM_VERSION };
      }
      return { id, type, mode: "exact", prompt: `${numerator}/${denominator} = ?%`, expected: percent.toFixed(1), unit: "%", inputHint: "输入百分数数值，保留 1 位小数，例如 12.5", explanation: `${numerator} ÷ ${denominator} × 100% = ${percent.toFixed(1)}%`, parameters: { numerator, denominator, precision: 1 }, algorithmVersion: SPEED_ALGORITHM_VERSION };
    }
    const base = integer(next, 20, 200) * 10; const rate = integer(next, 5, 30); const current = roundHalfUp(base * (1 + rate / 100), 1);
    if (mode === "exact" && index % 2 === 1) {
      return { id, type, mode, prompt: `基期量 ${base}，现期量 ${current}，求正增长率`, expected: rate.toFixed(1), unit: "%", inputHint: "输入增长率百分数值，保留 1 位小数", explanation: `（${current} − ${base}）÷ ${base} × 100% = ${rate.toFixed(1)}%`, parameters: { kind: "growth-rate", current, rate, base, precision: 1, toleranceBasisPoints: 0 }, algorithmVersion: SPEED_ALGORITHM_VERSION };
    }
    return { id, type, mode, prompt: `现期量 ${current}，同比正增长 ${rate}%，求基期量`, expected: base.toFixed(1), unit: "", inputHint: mode === "estimate" ? "输入估算值，允许相对误差 ±2%" : "输入数值，保留 1 位小数", explanation: `${current} ÷（1 + ${rate}%）= ${base.toFixed(1)}`, parameters: { kind: "base", current, rate, base, precision: 1, toleranceBasisPoints: mode === "estimate" ? 200 : 0 }, algorithmVersion: SPEED_ALGORITHM_VERSION };
  });
}

function finiteNumber(input: string): number | null {
  const normalized = input.trim().replace(/%$/, "");
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized); return Number.isFinite(value) ? value : null;
}

export function normalizedFraction(input: string): string | null {
  const match = /^\s*(-?\d+)\s*[\/:]\s*(-?\d+)\s*$/.exec(input);
  if (!match) return null;
  let numerator = Number(match[1]); let denominator = Number(match[2]);
  if (!denominator) return null;
  if (denominator < 0) { numerator *= -1; denominator *= -1; }
  const divisor = gcd(numerator, denominator);
  return `${numerator / divisor}/${denominator / divisor}`;
}

export function scoreSpeedInput(problem: SpeedProblem, input: string): { valid: boolean; correct: boolean; message: string } {
  if (input.includes("/") || input.includes(":")) {
    const actual = normalizedFraction(input); const expected = normalizedFraction(problem.expected);
    if (!actual) return { valid: false, correct: false, message: "分数格式无效或分母为 0" };
    return { valid: true, correct: Boolean(expected && actual === expected), message: expected && actual === expected ? "回答正确" : `正确答案是 ${problem.expected}` };
  }
  const actual = finiteNumber(input);
  if (actual === null) return { valid: false, correct: false, message: "请输入有效数字" };
  const expected = Number(problem.expected);
  if (problem.mode === "estimate") {
    if (!Number.isFinite(expected) || expected === 0) return { valid: false, correct: false, message: "估算标准值必须非零" };
    const basisPoints = Math.round(Math.abs(actual - expected) * 10000 / Math.abs(expected));
    const correct = basisPoints <= Number(problem.parameters.toleranceBasisPoints ?? 200);
    return { valid: true, correct, message: correct ? "估算正确" : "超出允许误差 ±2%" };
  }
  const precision = Number(problem.parameters.precision ?? 0);
  const correct = roundHalfUp(actual, precision) === roundHalfUp(expected, precision);
  return { valid: true, correct, message: correct ? "回答正确" : `正确答案是 ${problem.expected}${problem.unit}` };
}

export function summarizeSpeed(correct: number, wrong: number, skipped: number, effectiveMilliseconds: number) {
  const total = correct + wrong + skipped;
  return { correct, wrong, skipped, total, accuracy: total ? Math.round(correct / total * 100) : 0, averageMilliseconds: total ? Math.round(effectiveMilliseconds / total) : 0 };
}
