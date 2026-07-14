import React, { useState } from "react";
import { BrainCircuit, Sparkles, Check } from "lucide-react";
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

  const handleApply = async () => {
    setApplying(true);
    const now = new Date().toISOString();
    
    // We will auto-generate budgets for the suggested categories
    await db.transaction("rw", db.budgets, async () => {
      for (const item of plan.suggestedBudgets) {
        const allBudgets = await db.budgets.toArray();
        const existing = allBudgets.find(b => b.month === month && b.categoryId === item.categoryId);
        if (existing) {
          await db.budgets.update(existing.id, { limit: item.suggestedLimit, updatedAt: now });
        } else {
          await db.budgets.add({
            id: newId(),
            categoryId: item.categoryId,
            month: month,
            limit: item.suggestedLimit,
            createdAt: now,
            updatedAt: now
          });
        }
      }
    });

    setApplying(false);
    onApplied();
  };

  return (
    <Modal title="Kế hoạch chi tiêu thích ứng" onClose={onClose}>
      <div className="smart-plan">
        <div className="advisor-header">
          <BrainCircuit size={40} className="text-primary" />
          <p>
            Dựa trên forecast, nghĩa vụ đến hạn và thói quen chi thực tế của bạn trong tháng <strong>{month.split("-")[1]}</strong>. Không dùng tỷ lệ 50/30/20 cố định.
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
                  <span>{item.categoryName}</span>
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
    </Modal>
  );
}
