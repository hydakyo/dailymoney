import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OpeningBalanceForm, TransactionForm, RecurringForm } from "./Forms";

describe("Forms Component Tests", () => {
  it("renders OpeningBalanceForm correctly and handles submit", async () => {
    const handleSave = vi.fn();
    const handleClose = vi.fn();
    
    render(
      <OpeningBalanceForm
        current={1000}
        onSave={handleSave}
        onClose={handleClose}
      />
    );

    // Verify title is rendered
    expect(screen.getByText("Số dư đầu kỳ")).toBeDefined();
    
    // Verify default value is present in the input
    const input = screen.getByDisplayValue("1.000");
    expect(input).toBeDefined();

    // Click submit
    const submitBtn = screen.getByText("Lưu số dư đầu kỳ");
    await act(async () => { fireEvent.click(submitBtn); });

    // Verify onSave was called with new value
    expect(handleSave).toHaveBeenCalledWith(1000);
  });
});

describe("TransactionForm Component", () => {
  const mockCategories = [
    { id: "cat1", name: "Ăn uống", kind: "expense", archived: false, createdAt: "2023-01-01", updatedAt: "2023-01-01" },
    { id: "cat2", name: "Lương", kind: "income", archived: false, createdAt: "2023-01-01", updatedAt: "2023-01-01" }
  ];

  it("renders correctly for expense", () => {
    const handleSubmit = vi.fn();
    render(<TransactionForm categories={mockCategories as any} onSubmit={handleSubmit} onClose={vi.fn()} />);

    // Check defaults
    expect(screen.getByText("Ghi giao dịch")).toBeDefined();
    
    // Every available category is present, but nothing is silently selected.
    const categorySelect = screen.getByRole("combobox");
    expect(categorySelect).toBeDefined();
    expect(screen.getByText("Ăn uống")).toBeDefined();
    expect((categorySelect as HTMLSelectElement).value).toBe("");

    // Check submit disabled when amount empty
    const submitBtn = screen.getByText("Lưu giao dịch");
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits valid expense", async () => {
    const handleSubmit = vi.fn();
    render(<TransactionForm categories={mockCategories as any} onSubmit={handleSubmit} onClose={vi.fn()} />);

    // Find custom formatted input by role
    const inputs = screen.getAllByRole("textbox");
    // Amount input is the first textbox (formatted numeric input)
    const amountInput = inputs[0]; 
    fireEvent.change(amountInput, { target: { value: "50000" } });

    // A category must be explicit rather than silently using the first option.
    const submitBtn = screen.getByText("Lưu giao dịch");
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cat1" } });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);

    await act(async () => { fireEvent.click(submitBtn); });

    // Get the current date in YYYY-MM-DD
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

    expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({
      kind: "expense",
      amount: 50000,
      categoryId: "cat1",
      date: todayStr
    }));
  });
});

describe("RecurringForm Component", () => {
  const mockCategories = [
    { id: "cat1", name: "Ăn uống", kind: "expense", archived: false, createdAt: "2023-01-01", updatedAt: "2023-01-01" }
  ];

  it("renders and submits recurring rule", async () => {
    const handleSubmit = vi.fn();
    render(<RecurringForm categories={mockCategories as any} primaryWalletId="w1" onSubmit={handleSubmit} onClose={vi.fn()} />);

    expect(screen.getByText("Tạo giao dịch lặp")).toBeDefined();
    
    // Find custom formatted input for amount
    const inputs = screen.getAllByRole("textbox");
    const amountInput = inputs[0]; 
    fireEvent.change(amountInput, { target: { value: "100000" } });

    // Submit
    const submitBtn = screen.getByText("Tạo lịch lặp");
    await act(async () => { fireEvent.click(submitBtn); });

    // Get the current date day
    const todayDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

    expect(handleSubmit).toHaveBeenCalledWith(expect.objectContaining({
      kind: "expense",
      amount: 100000,
      categoryId: "cat1",
      frequency: "monthly",
      walletId: "w1",
      startDate: todayDate
    }));
  });
});
