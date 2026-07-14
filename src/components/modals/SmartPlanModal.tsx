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
    <Modal title="Cố vấn Kế hoạch (50/30/20)" onClose={onClose}>
      <div className="smart-plan">
        <div className="advisor-header">
          <BrainCircuit size={40} className="text-primary" />
          <p>
            Dựa trên lịch sử tài chính, đây là Kế hoạch Chi tiêu được đề xuất dành riêng cho bạn trong tháng <strong>{month.split("-")[1]}</strong>.
          </p>
        </div>

        <div className="plan-summary-box">
          <div className="row-between">
            <span>Thu nhập dự kiến:</span>
            <strong>{formatVnd(plan.averageIncome)}</strong>
          </div>
          <div className="row-between text-danger">
            <span>Trả nợ bắt buộc:</span>
            <strong>-{formatVnd(plan.mandatoryExpenses)}</strong>
          </div>
          <hr />
          <div className="row-between text-success">
            <span>Ngân sách khả dụng:</span>
            <strong>{formatVnd(plan.disposableIncome)}</strong>
          </div>
        </div>

        {plan.disposableIncome > 0 ? (
          <div className="plan-breakdown">
            <h4>Phân bổ 50/30/20:</h4>
            
            <div className="breakdown-section">
              <div className="row-between">
                <span className="text-primary"><strong>50% Thiết yếu</strong></span>
                <strong>{formatVnd(plan.needsTotal)}</strong>
              </div>
              <p className="hint">Dành cho: Ăn uống, Điện nước, Di chuyển...</p>
            </div>
            
            <div className="breakdown-section">
              <div className="row-between">
                <span className="text-warning"><strong>30% Tiêu dùng</strong></span>
                <strong>{formatVnd(plan.wantsTotal)}</strong>
              </div>
              <p className="hint">Dành cho: Mua sắm, Giải trí...</p>
            </div>

            <div className="breakdown-section">
              <div className="row-between">
                <span className="text-success"><strong>20% Tích lũy</strong></span>
                <strong>{formatVnd(plan.savesTotal)}</strong>
              </div>
              <p className="hint">Dành cho: Quỹ dự phòng, Đầu tư, Trả nợ sớm</p>
            </div>
          </div>
        ) : (
          <div className="alert alert-danger mt">
            <p>Thu nhập dự kiến không đủ để trang trải các khoản nợ bắt buộc! Vui lòng tìm cách gia tăng thu nhập hoặc khoanh nợ.</p>
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="secondary" onClick={onClose} disabled={applying}>Hủy</button>
        {plan.disposableIncome > 0 && (
          <button className="primary" onClick={handleApply} disabled={applying}>
            {applying ? "Đang áp dụng..." : <><Sparkles size={18}/> Áp dụng Kế hoạch này</>}
          </button>
        )}
      </div>
    </Modal>
  );
}
