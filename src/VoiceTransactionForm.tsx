import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, X, ClipboardPaste } from "lucide-react";
import type { Category, EditableTransactionKind, RecurringRule, Transaction } from "./domain";
import { today } from "./domain";
import { parseVoiceTransaction } from "./voice";
import { parseBankSms } from "./bank-parser";

type TransactionInput = {
  id?: string;
  kind: EditableTransactionKind;
  amount: number;
  categoryId: string;
  date: string;
  note?: string;
  recurring?: { frequency: RecurringRule["frequency"]; interval: number; dayOfMonth?: number };
};

type SpeechResult = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
type SpeechResultEvent = Event & { results: ArrayLike<SpeechResult>; resultIndex: number };
type SpeechErrorEvent = Event & { error?: string };
type SpeechRecognizer = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; abort: () => void; onresult: ((event: SpeechResultEvent) => void) | null; onerror: ((event: SpeechErrorEvent) => void) | null; onend: (() => void) | null };
type SpeechRecognizerConstructor = new () => SpeechRecognizer;

export function VoiceTransactionForm({
  transaction,
  categories,
  onSubmit,
  onClose
}: {
  transaction?: Transaction;
  categories: Category[];
  onSubmit: (value: TransactionInput) => Promise<void>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<EditableTransactionKind>(transaction?.kind === "income" ? "income" : "expense");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const [date, setDate] = useState(transaction?.date ?? today());
  const [note, setNote] = useState(transaction?.note ?? "");
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurringRule["frequency"]>("monthly");
  
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [pastedSms, setPastedSms] = useState("");
  const [showSmsInput, setShowSmsInput] = useState(false);

  const recognitionRef = useRef<SpeechRecognizer | null>(null);
  const transcriptRef = useRef("");
  const hasErrorRef = useRef(false);
  
  const relevant = useMemo(() => categories.filter(category => category.kind === kind && !category.archived), [categories, kind]);

  useEffect(() => {
    if (!relevant.some(category => category.id === categoryId)) {
      setCategoryId(relevant[0]?.id ?? "");
    }
  }, [categoryId, relevant, kind]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const applyTranscript = (text: string) => {
    const parsed = parseVoiceTransaction(text, categories);
    setKind(parsed.kind === "income" ? "income" : "expense");
    setAmount(parsed.amount ? String(parsed.amount) : "");
    setCategoryId(parsed.categoryId);
    setDate(parsed.date);
    setNote(parsed.note ?? "");
    setVoiceStatus(`Đã nghe: “${text}”`);
  };

  const startListening = () => {
    setVoiceError("");
    setVoiceStatus("");
    transcriptRef.current = "";
    hasErrorRef.current = false;
    const browser = window as Window & { SpeechRecognition?: SpeechRecognizerConstructor; webkitSpeechRecognition?: SpeechRecognizerConstructor };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) return setVoiceError("Thiết bị chưa hỗ trợ nhận dạng giọng nói trong app này.");
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "vi-VN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = event => {
      const results = Array.from(event.results);
      const text = results.map(result => result[0]?.transcript ?? "").join(" ").trim();
      if (!text) return;
      transcriptRef.current = text;
      setVoiceStatus(`Đã nghe: “${text}”`);
      if (results.slice(event.resultIndex).some(result => result.isFinal)) {
        applyTranscript(text);
      }
    };
    recognition.onerror = event => {
      hasErrorRef.current = true;
      setVoiceError(event.error === "not-allowed" ? "Hãy cho phép Micro." : `Lỗi micro (${event.error ?? "unknown"}).`);
    };
    recognition.onend = () => {
      setListening(false);
      if (transcriptRef.current) {
        applyTranscript(transcriptRef.current);
      } else if (!hasErrorRef.current) {
        setVoiceError("Không nhận diện được văn bản.");
      }
    };
    try {
      recognition.start();
      setListening(true);
      setVoiceStatus("Đang nghe… Ví dụ: hôm nay cà phê 35 nghìn.");
    } catch {
      setVoiceError("Không thể bắt đầu nhận dạng giọng nói.");
    }
  };

  const stopListening = () => {
    setVoiceStatus("Đang xử lý…");
    recognitionRef.current?.stop();
  };

  const handleSmsPaste = () => {
    const parsed = parseBankSms(pastedSms, categories);
    if (parsed.kind) setKind(parsed.kind === "income" ? "income" : "expense");
    if (parsed.amount) setAmount(String(parsed.amount));
    if (parsed.categoryId) setCategoryId(parsed.categoryId);
    if (parsed.date) setDate(parsed.date);
    if (parsed.note) setNote(parsed.note);
    setShowSmsInput(false);
    setPastedSms("");
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label={transaction ? "Sửa giao dịch" : "Ghi giao dịch"}>
        <div className="modal-head">
          <h2>{transaction ? "Sửa giao dịch" : "Ghi giao dịch"}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={21} /></button>
        </div>
        
        {!transaction && (
          <div className="voice-card" style={{ marginBottom: 12 }}>
            <div className="segmented">
              <button className={!showSmsInput ? "selected" : ""} onClick={() => setShowSmsInput(false)}>
                <Mic size={14} style={{ marginRight: 6 }} /> Giọng nói
              </button>
              <button className={showSmsInput ? "selected" : ""} onClick={() => setShowSmsInput(true)}>
                <ClipboardPaste size={14} style={{ marginRight: 6 }} /> Dán SMS
              </button>
            </div>
            
            {!showSmsInput ? (
              <>
                <button className={listening ? "voice-button recording" : "voice-button"} onClick={() => listening ? stopListening() : startListening()} style={{ marginTop: 12 }}>
                  {listening ? <Square size={18} fill="currentColor" /> : <Mic size={20} />}
                  {listening ? "Dừng và xử lý" : "Nói để ghi chép"}
                </button>
                {voiceStatus && <small className="voice-status">{voiceStatus}</small>}
                {voiceError && <p className="form-error">{voiceError}</p>}
              </>
            ) : (
              <div style={{ marginTop: 12 }}>
                <textarea 
                  placeholder="Dán tin nhắn trừ tiền từ ngân hàng vào đây..." 
                  value={pastedSms} 
                  onChange={e => setPastedSms(e.target.value)}
                  style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--border)", minHeight: 60, marginBottom: 8 }}
                />
                <button className="primary full" onClick={handleSmsPaste} disabled={!pastedSms}>
                  Trích xuất dữ liệu
                </button>
              </div>
            )}
          </div>
        )}

        <div className="kind-switch">
          <button className={kind === "expense" ? "selected expense-bg" : ""} onClick={() => setKind("expense")}>Chi tiền</button>
          <button className={kind === "income" ? "selected income-bg" : ""} onClick={() => setKind("income")}>Thu tiền</button>
        </div>

        <label className="field">
          <span>Số tiền</span>
          <input inputMode="numeric" placeholder="0" value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ""))} />
        </label>

        <label className="field">
          <span>Danh mục</span>
          <select value={categoryId} onChange={event => setCategoryId(event.target.value)}>
            {relevant.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Ngày</span>
          <input type="date" value={date} onChange={event => setDate(event.target.value)} />
        </label>

        <label className="field">
          <span>Ghi chú <em>(không bắt buộc)</em></span>
          <input value={note} onChange={event => setNote(event.target.value)} placeholder="Ví dụ: cà phê sáng" />
        </label>

        {!transaction && (
          <>
            <label className="checkbox">
              <input type="checkbox" checked={recurring} onChange={event => setRecurring(event.target.checked)} /> Lặp lại giao dịch này
            </label>
            {recurring && (
              <label className="field">
                <span>Tần suất</span>
                <select value={frequency} onChange={event => setFrequency(event.target.value as RecurringRule["frequency"])}>
                  <option value="daily">Mỗi ngày</option>
                  <option value="weekly">Mỗi tuần</option>
                  <option value="monthly">Mỗi tháng</option>
                  <option value="yearly">Mỗi năm</option>
                </select>
              </label>
            )}
          </>
        )}

        <button 
          className="primary full" 
          disabled={!amount || !categoryId || listening} 
          onClick={() => void onSubmit({ 
            id: transaction?.id, 
            kind, 
            amount: Number(amount), 
            categoryId,
            date, 
            note: note || undefined, 
            recurring: recurring ? { frequency, interval: 1, dayOfMonth: Number(date.slice(-2)) } : undefined 
          })}
        >
          {transaction ? "Lưu thay đổi" : "Lưu giao dịch"}
        </button>
      </section>
    </div>
  );
}
