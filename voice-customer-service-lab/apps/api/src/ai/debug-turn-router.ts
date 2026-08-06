import type { TurnRouteDecision, TurnRouter, TurnRoutingRequest } from "./ai-ports.js";

/** Local course adapter only; production query understanding is implemented in lesson 08. */
export class DebugTurnRouter implements TurnRouter {
  readonly name = "debug-rule-router";

  async route(request: TurnRoutingRequest): Promise<TurnRouteDecision> {
    const text = request.text.trim();
    if (/忽略.*规则|系统提示|提示词|验证码|密码/u.test(text)) {
      return decision("safety_refusal", text, "debug_safety");
    }
    if (/你是(真人|谁)|真人客服/u.test(text)) {
      return decision("direct_answer", text, "debug_identity");
    }
    if (/股票|投资|法律意见|医疗诊断/u.test(text)) {
      return decision("out_of_scope", text, "debug_out_of_scope");
    }
    if (/直接.*退款|修改.*地址|改.*收货地址|赔偿/u.test(text)) {
      return decision("handoff", text, "debug_high_impact");
    }
    if (/订单.*(到哪|状态|物流)|发票.*(开好|状态)/u.test(text)) {
      return decision("tool_required", text, "debug_private_fact");
    }
    if (/这个.*(能退|能换)/u.test(text)) {
      return decision("clarify", text, "debug_ambiguous");
    }
    return decision("grounded_answer", text, "debug_public_knowledge");
  }
}

function decision(
  mode: TurnRouteDecision["mode"],
  query: string,
  reason: string,
): TurnRouteDecision {
  return { mode, query, reason };
}
