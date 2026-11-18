import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ReportModalProps {
  targetType: 'post' | 'comment' | 'user' | 'job' | 'organization' | 'message';
  targetId: number;
  label: string;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  targetType,
  targetId,
  label,
  onClose,
}) => {
  const { apiFetch } = useAuth();
  const [reason, setReason] = useState('Misleading or fraudulent content');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ targetType, targetId, reason, details }),
      });
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Report {label}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close report dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Thank you. Your report has been logged for platform moderation review. Your identity
              is kept confidential from the reported account.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-[#0F5C4D] px-4 py-2 text-sm font-medium text-white hover:bg-[#0c4a3e]"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option>Misleading or fraudulent content</option>
                <option>Harassment or abusive conduct</option>
                <option>Spam or unauthorized solicitation</option>
                <option>Fake job posting or recruitment scam</option>
                <option>Impersonation</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Additional context (optional)
              </label>
              <textarea
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Provide specific details to help our trust & safety team..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
