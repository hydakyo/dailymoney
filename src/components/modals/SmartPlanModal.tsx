import React, { useState } from "react";
import { BrainCircuit, Sparkles } from "lucide-react";
import { formatVnd, newId } from "../../domain";
import { Modal } from "../ui/Modal";
import type { AppData } from "../../store";
import { generateSmartPlan } from "../../smart-advisor";
import { db } from "../../db";

export function SmartPlanModal({ 
  data, 
  month, 
  onClose,
  onApplied
}: { 
  data: AppData; 
  month: string; 
  onClose: () => void;
  onApplied: () => void;
}) {
  const plan = generateSmartPlan(data, month);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const confidenceLabel = { low: "Đang học", medium: "Khá tin cậy", high: "Tin cậy" }[plan.behaviorConfidence];
  const existingBudgets = new Map(data.budgets.filter(budget => budget.month === month).map(budget => [budget.categoryId, budget]));

  if (!plan.isCurrentMonth) {
    return (
      <Modal title="Kế hoạch chi tiêu thích ứng" onClose={onClose}>
        <div className="alert alert-danger">
          <p>Kế hoạch thông minh chỉ hỗ trợ tháng đang diễn ra. Ứng dụng cần số dư hiện tại, các nghĩa vụ còn lại và lịch sử chi tiêu đến hôm nay để không tạo ngân sách sai cho tháng khác.</p>
        </div>
        <div className="modal-footer"><button className="primary" onClick={onClose}>Đã hiểu</button></div>
      </Modal>
    );
  }

  const handleApply = async () => {
    if (!plan.suggestedBudgets.length || !window.confirm("Áp dụng các thay đổi ngân sách đã xem trước? Ngân sách hiện có của các danh mục này sẽ được cập nhật.")) return;
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
          if (existing) {
            await db.budgets.update(existing.id, { limit: item.suggestedLimit, updatedAt: now });
          } else {
            await db.budgets.add({ id: newId(), categoryId: item.categoryId, month, limit: item.suggestedLimit, createdAt: now, updatedAt: now });
          }
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
        <div className="advisor-header">
          <BrainCircuit size={40} className="text-primary" />
          <p>
            Dựa trên forecast, nghĩa vụ đến hạn và thói quen chi thực tế của bạn trong tháng <strong>{month.split("-")[1]}</strong>. Không dùng tỷ lệ 50/30/20 cố định. Dữ liệu thói quen: <strong>{confidenceLabel}</strong>.
          </p>
        </div>

        <div className="plan-summary-box">
          <div className="row-between">
            <span>Số dư dự kiến cuối tháng:</span>
            <strong className={plan.projectedBalance < 0 ? "text-danger" : "text-success"}>{formatVnd(plan.projectedBalance)}</strong>
          </div>
          <div className="row-between text-danger">
            <span>Nghĩa vụ còn lại:</span>
            <strong>-{formatVnd(plan.mandatoryExpenses)}</strong>
          </div>
          <div className="row-between">
            <span>Thu còn dự kiến:</span>
            <strong className="text-success">+{formatVnd(plan.forecastIncome)}</strong>
          </div>
          <hr />
          <div className="row-between">
            <span>Được chi linh hoạt thêm:</span>
            <strong>{formatVnd(plan.flexibleAllowance)}</strong>
          </div>
          <div className={plan.shortfall > 0 ? "row-between text-danger" : "row-between"}>
            <span>Điểm đáy thận trọng:</span>
            <strong>{formatVnd(plan.lowestBalance)}{plan.lowestBalanceDate ? ` · ${plan.lowestBalanceDate}` : ""}</strong>
          </div>
        </div>

        <div className="plan-breakdown">
          <h4>Ba kịch bản cuối tháng</h4>
          <p className="hint">Kế hoạch áp dụng kịch bản thận trọng để không chi dựa vào khoản phải thu chưa chắc chắn.</p>
          <div className="scenario-grid">
            {plan.scenarios.map(scenario => (
              <div className={`scenario-card ${scenario.shortfall > 0 ? "at-risk" : ""}`} key={scenario.id}>
                <strong>{scenario.label}</strong>
                <span>{scenario.description}</span>
                <b className={scenario.endingBalance < 0 ? "text-danger" : "text-success"}>{formatVnd(scenario.endingBalance)}</b>
                <small>Đáy: {formatVnd(scenario.lowestBalance)}{scenario.lowestBalanceDate ? ` · ${scenario.lowestBalanceDate}` : ""}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="plan-breakdown">
          <h4>Ưu tiên hành động</h4>
          {plan.priorityActions.map(action => (
            <div className={`cash-flow-action ${action.level}`} key={action.title}>
              <strong>{action.title}</strong>
              <p>{action.detail}</p>
            </div>
          ))}
          {plan.dailyFlexibleCap > 0 && <p className="hint">Mức chi linh hoạt đề xuất an toàn: {formatVnd(plan.dailyFlexibleCap)} mỗi ngày.</p>}
          {plan.upcomingObligations.length > 0 && (
            <div className="breakdown-section">
              <strong>Thứ tự nghĩa vụ cần bảo vệ</strong>
              {plan.upcomingObligations.map(item => <div className="row-between obligation-row" key={`${item.date}:${item.label}`}><span><em className={`priority-tag ${item.priority}`}>{item.priorityLabel}</em>{item.date} · {item.label}</span><strong>-{formatVnd(item.amount)}</strong></div>)}
            </div>
          )}
        </div>

        {plan.suggestedBudgets.length ? (
          <div className="plan-breakdown">
            <h4>Hạn mức theo dữ liệu của bạn</h4>
            <p className="hint">{plan.summary}</p>
            
            <div className="breakdown-section">
              <div className="row-between">
                <span className="text-primary"><strong>Chi thiết yếu</strong></span>
                <strong>{formatVnd(plan.needsTotal)}</strong>
              </div>
              <p className="hint">Tổng từ các danh mục thiết yếu có lịch sử chi tiêu.</p>
            </div>
            
            <div className="breakdown-section">
              <div className="row-between">
                <span className="text-warning"><strong>Chi tùy chọn</strong></span>
                <strong>{formatVnd(plan.wantsTotal)}</strong>
              </div>
              <p className="hint">Không chia đều; phân bổ theo tỷ trọng chi thực tế.</p>
            </div>

            <div className="breakdown-section">
              <div className="row-between">
                <span className="text-success"><strong>Nên giữ lại</strong></span>
                <strong>{formatVnd(plan.recommendedReserve)}</strong>
              </div>
              <p className="hint">Khoảng 7 ngày chi linh hoạt; phần có thể dành thêm: {formatVnd(plan.savesTotal)}.</p>
            </div>

            <div className="breakdown-section">
              {plan.suggestedBudgets.map(item => (
                <div className="row-between" key={item.categoryId}>
                  <span>{item.categoryName}{existingBudgets.get(item.categoryId) ? ` · ${formatVnd(existingBudgets.get(item.categoryId)!.limit)} →` : " · Mới →"}</span>
                  <strong>{formatVnd(item.suggestedLimit)}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="alert alert-danger mt">
            <p>{plan.summary} Hãy ghi thêm giao dịch để ứng dụng có dữ liệu tạo hạn mức theo thói quen chi tiêu.</p>
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="secondary" onClick={onClose} disabled={applying}>Hủy</button>
        {plan.suggestedBudgets.length > 0 && (
          <button className="primary" onClick={handleApply} disabled={applying}>
            {applying ? "Đang áp dụng..." : <><Sparkles size={18}/> Áp dụng Kế hoạch này</>}
          </button>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
