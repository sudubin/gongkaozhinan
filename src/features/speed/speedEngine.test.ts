import { describe, expect, it } from "vitest";
import { generateSpeedSet, normalizedFraction, scoreSpeedInput, summarizeSpeed } from "./speedEngine";

describe("速算确定性规则", () => {
  it("两位数乘一位数固定种子可复现，10 个样例均独立验算", () => {
    const first = generateSpeedSet("two-digit-times-one", "fixed");
    expect(first).toEqual(generateSpeedSet("two-digit-times-one", "fixed"));
    expect(first).toHaveLength(10);
    for (const problem of first) {
      const { left, right } = problem.parameters as { left: number; right: number };
      expect(left).toBeGreaterThanOrEqual(10); expect(left).toBeLessThanOrEqual(99); expect(right).toBeGreaterThanOrEqual(2); expect(right).toBeLessThanOrEqual(9);
      expect(Number(problem.expected)).toBe(left * right); expect(problem.algorithmVersion).toBe("speed-v1");
    }
  });

  it("分数百分数 10 个样例按独立除法验算且 12.50 等值输入正确", () => {
    const problems = generateSpeedSet("fraction-percent", "fractions");
    for (const [index, problem] of problems.entries()) {
      const { numerator, denominator } = problem.parameters as { numerator: number; denominator: number };
      expect(denominator).not.toBe(0);
      if (index % 2) expect(scoreSpeedInput(problem, `${numerator}/${denominator}`).correct).toBe(true);
      else expect(Number(problem.expected)).toBe(Math.round(numerator / denominator * 1000) / 10);
    }
    const sample = { ...problems[0]!, expected: "12.5", parameters: { precision: 1 } };
    expect(scoreSpeedInput(sample, "12.50").correct).toBe(true);
    expect(normalizedFraction("2/4")).toBe("1/2"); expect(normalizedFraction("1/0")).toBeNull(); expect(normalizedFraction("2:4")).toBe("1/2");
  });

  it("正增长基期量 10 个样例可由参数复算，精算与估算分离", () => {
    const exact = generateSpeedSet("growth-base", "growth", "exact");
    for (const problem of exact) {
      const { kind, current, rate, base } = problem.parameters as { kind: string; current: number; rate: number; base: number };
      expect(rate).toBeGreaterThan(0); expect(base).not.toBe(0);
      if (kind === "growth-rate") expect(Math.round((current - base) / base * 1000) / 10).toBe(Number(problem.expected));
      else expect(Math.round(current / (1 + rate / 100) * 10) / 10).toBe(Number(problem.expected));
    }
    const estimate = { ...generateSpeedSet("growth-base", "edge", "estimate")[0]!, expected: "1000.0", parameters: { precision: 1, toleranceBasisPoints: 200 } };
    for (const value of [980, 1000, 1020]) expect(scoreSpeedInput(estimate, String(value)).correct).toBe(true);
    for (const value of [979, 1021]) expect(scoreSpeedInput(estimate, String(value)).correct).toBe(false);
    expect(scoreSpeedInput(estimate, "abc").valid).toBe(false);
    expect(scoreSpeedInput({ ...estimate, expected: "0" }, "0").valid).toBe(false);
  });

  it("汇总将 8 对 1 错 1 跳记为 80%，模式由会话分别保存", () => {
    expect(summarizeSpeed(8, 1, 1, 10000)).toEqual({ correct: 8, wrong: 1, skipped: 1, total: 10, accuracy: 80, averageMilliseconds: 1000 });
  });
});
