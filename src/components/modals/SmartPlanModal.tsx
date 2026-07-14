import React, { useState } from "react";
import { BrainCircuit, Sparkles } from "lucide-react";
import { formatVnd, newId } from "../../domain";
import { Modal } from "../ui/Modal";
import type { AppData } from "../../store";
import { generateSmartPlan, type SmartPlanScenarioId } from "../../smart-advisor";
import { formatDateVi } from "../../utils";
import { db } from "../../db";

export function SmartPlanModal({ data, month, onClose, onApplied }: { data: AppData; month: string; onClose: () => void; onApplied: () => void }) {
  const initialPlan = generateSmartPlan(data, month);
  const [scenario, setScenario] = useState<SmartPlanScenarioId>(initialPlan.defaultScenario);
  const plan = generateSmartPlan(data, month, scenario);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const confidenceLabel = { low: "Đang học", medium: "Khá tin cậy", high: "Tin cậy" }[plan.behaviorConfidence];
  const existingBudgets = new Map(data.budgets.filter(budget => budget.month === month).map(budget => [budget.categoryId, budget]));
  const essentialItems = plan.suggestedBudgets.filter(item => item.kind === "need").slice(0, 3);
  const discretionaryItems = plan.suggestedBudgets.filter(item => item.kind === "want").slice(0, 3);

  if (!plan.isCurrentMonth) {
    return <Modal title="Kế hoạch chi tiêu thích ứng" onClose={onClose}><div className="alert alert-danger"><p>Kế hoạch thông minh chỉ hỗ trợ tháng đang diễn ra để không tạo ngân sách sai cho tháng khác.</p></div><div className="modal-footer"><button className="primary" onClick={onClose}>Đã hiểu</button></div></Modal>;
  }

  const handleApply = async () => {
    if (!plan.isBalanced || !plan.suggestedBudgets.length || !window.confirm(`Áp dụng kịch bản ${plan.scenarios.find(item => item.id === plan.selectedScenario)?.label.toLowerCase()}? Các hạn mức bên dưới sẽ được cập nhật.`)) return;
    setApplying(true);
    setError("");
    const now = new Date().toISOString();
    let applied = false;
    try {
      await db.transaction("rw", db.budgets, async () => {
        const currentBudgets = await db.budgets.where("month").equals(month).toArray();
        const currentByCategory = new Map(currentBudgets.map(budget => [budget.categoryId, budget]));
        for (const item of plan.suggestedBudgets) {
          const existing = currentByCategory.get(item.categoryId);
          if (existing) await db.budgets.update(existing.id, { limit: item.suggestedLimit, updatedAt: now });
          else await db.budgets.add({ id: newId(), categoryId: item.categoryId, month, limit: item.suggestedLimit, createdAt: now, updatedAt: now });
        }
      });
      applied = true;
    } catch {
      setError("Không thể áp dụng ngân sách. Dữ liệu chưa bị thay đổi; vui lòng thử lại.");
    } finally {
      setApplying(false);
    }
    if (applied) onApplied();
  };

  return (
    <Modal title="Kế hoạch chi tiêu thích ứng" onClose={onClose}>
      <div className="smart-plan">
        <div className="advisor-header"><BrainCircuit size={40} className="text-primary" /><p>Dựa trên dòng tiền, nghĩa vụ đến hạn và thói quen chi của bạn. Dữ liệu thói quen: <strong>{confidenceLabel}</strong>.</p></div>

        <div className={plan.isBalanced ? "alert alert-success" : "alert alert-danger"}>
          <strong>{plan.isBalanced ? "KẾ HOẠCH ĐỦ AN TOÀN" : "KẾ HOẠCH CHƯA CÂN BẰNG"}</strong>
          <p>{plan.isBalanced ? `Kịch bản ${plan.scenarios.find(item => item.id === plan.selectedScenario)?.label.toLowerCase()} vẫn giữ quỹ tối thiểu ${formatVnd(plan.reserveFloor)}.` : `Dù cắt toàn bộ chi linh hoạt, vẫn thiếu ${formatVnd(plan.unresolvedShortfall)} để giữ quỹ tối thiểu ${formatVnd(plan.reserveFloor)}. Không nên áp dụng như một kế hoạch hoàn chỉnh.`}</p>
        </div>

        <div className="plan-summary-box">
          <div className="row-between"><span>Hôm nay nên chi linh hoạt tối đa</span><strong className={plan.dailyFlexibleCap > 0 ? "text-success" : "text-danger"}>{plan.dailyFlexibleCap > 0 ? `${formatVnd(plan.dailyFlexibleCap)}/ngày` : "Tạm dừng chi linh hoạt"}</strong></div>
          <div className="row-between"><span>Chi linh hoạt theo xu hướng</span><strong>{formatVnd(plan.trendFlexibleExpense)}</strong></div>
          <div className="row-between"><span>Hạn mức theo kế hoạch</span><strong>{formatVnd(plan.flexibleAllowance)}</strong></div>
          <div className="row-between"><span>Mức cần cắt giảm</span><strong className={plan.budgetReduction > 0 ? "text-danger" : ""}>{formatVnd(plan.budgetReduction)}</strong></div>
          <hr />
          <div className="row-between"><span>Quỹ tối thiểu cần giữ</span><strong>{formatVnd(plan.reserveFloor)}</strong></div>
          <div className={plan.shortfall > 0 ? "row-between text-danger" : "row-between"}><span>Ngày rủi ro cao nhất</span><strong>{plan.lowestBalanceDate ? formatDateVi(plan.lowestBalanceDate) : "Không có"}</strong></div>
          <div className={plan.lowestBalance < plan.reserveFloor ? "row-between text-danger" : "row-between"}><span>Số dư thấp nhất</span><strong>{formatVnd(plan.lowestBalance)}</strong></div>
        </div>

        <div className="plan-breakdown">
          <h4>Chọn kịch bản để lập ngân sách</h4>
          <div className="scenario-grid">
            {plan.scenarios.map(item => <button type="button" className={`scenario-card ${item.shortfall > 0 ? "at-risk" : ""} ${scenario === item.id ? "selected" : ""}`} key={item.id} onClick={() => setScenario(item.id)}><strong>{item.label}</strong><span>{item.description}</span><b className={item.endingBalance < 0 ? "text-danger" : "text-success"}>{formatVnd(item.endingBalance)}</b><small>Rủi ro: {formatVnd(item.shortfall)}{item.lowestBalanceDate ? ` · ${formatDateVi(item.lowestBalanceDate)}` : ""}</small></button>)}
          </div>
        </div>

        <div className="plan-breakdown">
          <h4>Ưu tiên hành động</h4>
          {plan.priorityActions.map(action => <div className={`cash-flow-action ${action.level}`} key={action.title}><strong>{action.title}</strong><p>{action.detail}</p></div>)}
          {plan.upcomingObligations.length > 0 && <div className="breakdown-section"><strong>Nghĩa vụ cần bảo vệ</strong>{plan.upcomingObligations.map(item => { const days = Math.max(0, Math.ceil((new Date(`${item.date}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000)); const due = days === 0 ? "Hôm nay" : `Còn ${days} ngày`; return <div className="row-between obligation-row" key={`${item.date}:${item.label}`}><span><em className={`priority-tag ${item.priority}`}>{item.priorityLabel}</em>{due} · {item.label}</span><strong>-{formatVnd(item.amount)}</strong></div>; })}</div>}
        </div>

        <div className="plan-breakdown">
          <h4>Ngân sách theo kịch bản {plan.scenarios.find(item => item.id === plan.selectedScenario)?.label.toLowerCase()}</h4>
          <p className="hint">{plan.summary}</p>
          {essentialItems.length > 0 && <div className="breakdown-section"><div className="row-between"><span className="text-primary"><strong>Chi thiết yếu</strong></span><strong>{formatVnd(plan.needsTotal)}</strong></div>{essentialItems.map(item => <div className="row-between" key={item.categoryId}><span>{item.categoryName}</span><strong>{formatVnd(item.suggestedLimit)}</strong></div>)}</div>}
          {discretionaryItems.length > 0 ? <div className="breakdown-section"><div className="row-between"><span className="text-warning"><strong>Chi tùy chọn</strong></span><strong>{formatVnd(plan.wantsTotal)}</strong></div>{discretionaryItems.map(item => <div className="row-between" key={item.categoryId}><span>{item.categoryName}</span><strong>{formatVnd(item.suggestedLimit)}</strong></div>)}</div> : <div className="breakdown-section"><strong>Chi tùy chọn</strong><p className="hint">Không phát hiện chi tùy chọn trong dữ liệu dùng để lập kế hoạch.</p></div>}
          <div className="breakdown-section"><div className="row-between"><span className="text-success"><strong>Quỹ cần giữ</strong></span><strong>{formatVnd(plan.recommendedReserve)}</strong></div><p className="hint">{plan.recommendedReserve > 0 ? "Gồm khoảng 7 ngày chi thiết yếu hoặc 5% nghĩa vụ còn lại, lấy mức cao hơn." : "Hiện chưa đủ khả năng tạo quỹ dự phòng."}</p></div>
          {plan.suggestedBudgets.length > 0 && <div className="breakdown-section">{plan.suggestedBudgets.map(item => <div className="row-between" key={item.categoryId}><span>{item.categoryName}{existingBudgets.get(item.categoryId) ? ` · ${formatVnd(existingBudgets.get(item.categoryId)!.limit)} →` : " · Mới →"}</span><strong>{formatVnd(item.suggestedLimit)}</strong></div>)}</div>}
        </div>
      </div>

      <div className="modal-footer"><button className="secondary" onClick={onClose} disabled={applying}>Hủy</button>{plan.isBalanced && plan.suggestedBudgets.length > 0 ? <button className="primary" onClick={handleApply} disabled={applying}>{applying ? "Đang áp dụng..." : <><Sparkles size={18} /> Áp dụng kịch bản này</>}</button> : <button className="primary" disabled>Cần xử lý thiếu hụt trước</button>}</div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
