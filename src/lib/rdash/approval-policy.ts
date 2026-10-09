import type { ApprovalPolicy, ApprovalTrigger } from "./types";

export function requiredApprovalPolicy(
  policies: readonly ApprovalPolicy[],
  trigger: ApprovalTrigger,
  amount: number,
): ApprovalPolicy | null {
  return policies.find((policy) => {
    if (!policy.enabled || policy.trigger !== trigger) return false;
    if (policy.operator === ">") return amount > policy.threshold;
    if (policy.operator === ">=") return amount >= policy.threshold;
    return amount === policy.threshold;
  }) || null;
}
