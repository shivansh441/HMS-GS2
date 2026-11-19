import React, { FormEvent, useEffect, useState } from 'react';
import { X } from 'lucide-react';

const inputClass =
  'w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const paymentMethods = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'] as const;

interface ModalDetails {
  personName: string;
  propertyName: string;
  unitNumber: string;
  currency: string;
  amountDue: number | string;
  isSubmitting: boolean;
  errorMessage: string;
  onClose: () => void;
}

interface CheckoutModalProps extends ModalDetails {
  kind: 'checkout';
  checkIn: string | null;
  expectedCheckOut: string | null;
  onSubmit: (data: {
    amount: string;
    folioSettled: boolean;
    keycardReturned: boolean;
  }) => void;
}

interface InvoicePaymentModalProps extends ModalDetails {
  kind: 'invoice';
  invoiceNumber: string;
  billingMonth: string;
  onSubmit: (data: {
    amount: string;
    paymentMethod: typeof paymentMethods[number];
    reference: string;
  }) => void;
}

type PaymentCollectionModalProps = CheckoutModalProps | InvoicePaymentModalProps;

function formatCurrency(value: number | string, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value));
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

export const PaymentCollectionModal: React.FC<PaymentCollectionModalProps> = (props) => {
  const [amount, setAmount] = useState(String(props.amountDue));
  const [paymentMethod, setPaymentMethod] = useState<typeof paymentMethods[number]>('CASH');
  const [reference, setReference] = useState('');
  const [folioSettled, setFolioSettled] = useState(false);
  const [keycardReturned, setKeycardReturned] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !props.isSubmitting) props.onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.isSubmitting, props.onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (props.kind === 'checkout') {
      props.onSubmit({ amount, folioSettled, keycardReturned });
    } else {
      props.onSubmit({ amount, paymentMethod, reference: reference.trim() });
    }
  };

  const isCheckout = props.kind === 'checkout';
  const title = isCheckout ? 'Checkout and collect' : 'Record payment';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-collection-title"
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="payment-collection-title" className="font-bold">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {props.personName} · {props.propertyName} · {props.unitNumber}
            </p>
            {props.kind === 'invoice' && (
              <p className="mt-1 text-xs text-slate-500">
                {props.invoiceNumber} · {props.billingMonth.slice(0, 7)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            disabled={props.isSubmitting}
            aria-label="Close payment dialog"
            className="text-slate-500 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <dl className="grid grid-cols-2 gap-3 text-xs">
          {props.kind === 'checkout' ? (
            <>
              <div><dt className="text-slate-500">Check-in</dt><dd>{formatDate(props.checkIn)}</dd></div>
              <div><dt className="text-slate-500">Expected checkout</dt><dd>{formatDate(props.expectedCheckOut)}</dd></div>
              <div><dt className="text-slate-500">Bill to collect</dt><dd>{formatCurrency(props.amountDue, props.currency)}</dd></div>
            </>
          ) : (
            <>
              <div><dt className="text-slate-500">Outstanding balance</dt><dd>{formatCurrency(props.amountDue, props.currency)}</dd></div>
              <div><dt className="text-slate-500">Payment type</dt><dd>Hostel fee payment</dd></div>
            </>
          )}
        </dl>

        {props.errorMessage && (
          <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {props.errorMessage}
          </div>
        )}

        <label className="block space-y-1 text-xs font-semibold">
          {isCheckout ? 'Amount collected at checkout' : 'Payment amount'} ({props.currency})
          <input
            type="number"
            min={isCheckout ? '0' : '0.01'}
            max={isCheckout ? undefined : Number(props.amountDue)}
            step="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={inputClass}
          />
        </label>

        {props.kind === 'checkout' ? (
          <>
            <p className="text-xs text-slate-500">
              Digital access details are not managed by the current key system. Verify key return at the desk.
            </p>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={folioSettled} onChange={(event) => setFolioSettled(event.target.checked)} />
              Folio settled
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={keycardReturned} onChange={(event) => setKeycardReturned(event.target.checked)} />
              Keycard returned
            </label>
          </>
        ) : (
          <>
            <label className="block space-y-1 text-xs font-semibold">
              Payment method
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}
                className={inputClass}
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>{method.replace('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Reference <span className="font-normal text-slate-500">(optional)</span>
              <input
                maxLength={100}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                className={inputClass}
              />
            </label>
          </>
        )}

        <div className="flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            type="button"
            onClick={props.onClose}
            disabled={props.isSubmitting}
            className="flex-1 border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-50 dark:border-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              props.isSubmitting ||
              (props.kind === 'checkout' && (!folioSettled || !keycardReturned))
            }
            className="flex-1 bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {props.isSubmitting ? 'Saving…' : title}
          </button>
        </div>
      </form>
    </div>
  );
};
