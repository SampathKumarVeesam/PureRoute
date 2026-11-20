import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import { api } from '../lib/api';
import type { DairyProduct, OrderRecord } from '../types/domain';

interface FeedbackModalProps {
  mode: 'reminder' | 'direct';
  pendingOrder: OrderRecord | null;
  directProduct?: DairyProduct | null;
  directOrderId?: string;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}

export const FeedbackReminderModal: React.FC<FeedbackModalProps> = ({
  mode,
  pendingOrder,
  directProduct,
  directOrderId,
  onClose,
  onSubmitted,
}) => {
  const defaultProductId = directProduct?.id || pendingOrder?.items[0]?.productId || 101;
  const defaultProductName =
    directProduct?.name || pendingOrder?.items[0]?.productName || 'Farm-Fresh Dairy';

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.submitFeedback({
        orderId: directOrderId || pendingOrder?.id || 'direct_review',
        productId: defaultProductId,
        rating,
        comment: comment.trim() || 'Chilled, fresh, and delivered right on time.',
      });
      await onSubmitted();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    if (mode === 'reminder' && pendingOrder) {
      setBusy(true);
      try {
        await api.dismissFeedback(pendingOrder.id, dontAskAgain);
        if (dontAskAgain) {
          await api.saveFeedbackPreferences(true);
        }
      } catch {
        // close cleanly
      } finally {
        setBusy(false);
      }
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      <div className="glass-panel w-full max-w-md rounded-md p-7 text-[#f3efe8] space-y-5">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#e4cca2]/16">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#d8b06c]">
              Post-Delivery Tasting Ledger
            </p>
            <h3 className="mt-1 font-editorial text-2xl text-[#f8f5ef]">
              {mode === 'reminder' ? 'How Was Your Morning Dairy?' : 'Record a Product Review'}
            </h3>
            <p className="mt-1 text-xs text-[#9aa4ae] font-mono-tabular">
              {pendingOrder
                ? `${pendingOrder.orderNumber} · ${defaultProductName}`
                : defaultProductName}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 text-[#9aa4ae] hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="rounded-sm bg-rose-500/12 border border-rose-400/35 px-3.5 py-2.5 text-xs text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-2">
              Freshness &amp; Quality Rating
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1.5 rounded-sm hover:bg-white/5 transition-colors cursor-pointer"
                  aria-label={`Rate ${star} stars`}
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= rating ? 'text-[#d8b06c] fill-[#d8b06c]' : 'text-[#394652]'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
              Tasting &amp; Punctuality Notes
            </label>
            <textarea
              rows={3}
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share feedback on creaminess, chilling temperature, or morning delivery punctuality..."
              className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm"
            />
          </div>

          {mode === 'reminder' && (
            <label className="flex items-start gap-2.5 text-xs text-[#b7c0c9] cursor-pointer">
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                className="mt-0.5 accent-[#d8b06c]"
              />
              <span>
                Don&apos;t ask again via popup (the standard &ldquo;Write a Review&rdquo; button stays permanently active on Product Details &amp; Order History)
              </span>
            </label>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e4cca2]/14">
            <button
              type="button"
              disabled={busy}
              onClick={handleDismiss}
              className="px-4 py-2 text-xs text-[#9aa4ae] hover:text-white cursor-pointer"
            >
              {mode === 'reminder' ? (dontAskAgain ? 'Dismiss Permanently' : 'Remind Me in 1 Hour') : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] cursor-pointer"
            >
              {busy ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
