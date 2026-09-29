import React, { useState } from 'react';
import {
  CheckCircle, Download, Printer, X, Copy, Check,
  CreditCard, ShieldCheck, ArrowRight
} from 'lucide-react';

const ReceiptModal = ({ receipt, onClose, onTransferFunds }) => {
  const [copied, setCopied] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!receipt) return null;

  const handleCopyId = () => {
    navigator.clipboard?.writeText(receipt.id || receipt.transactionId || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  const isSuccess = receipt.status === 'success' || receipt.status === 'completed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[94vh] flex flex-col overflow-hidden border border-gray-100 my-auto">
        {/* Receipt Header Banner */}
        <div className={`p-4 sm:p-6 text-center ${isSuccess ? 'bg-gradient-to-br from-green-600 to-emerald-700' : 'bg-gradient-to-br from-blue-600 to-indigo-700'} text-white relative shrink-0`}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Close receipt"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/20 backdrop-blur-md mb-2 sm:mb-3">
            <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
          </div>

          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold bg-white/20 px-2.5 py-0.5 rounded-full">
              ReachPay Verified
            </span>
          </div>

          <h2 className="text-lg sm:text-xl font-bold tracking-tight">Transaction Successful</h2>
          <p className="text-xs sm:text-sm text-emerald-100 opacity-90 mt-0.5">{receipt.service || 'Financial Service'}</p>

          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-white/20">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              ₹{Number(receipt.amount || 0).toLocaleString('en-IN')}
            </p>
            {receipt.walletCredit && (
              <span className="inline-block mt-1 text-[11px] sm:text-xs font-semibold bg-white text-emerald-800 px-2.5 py-0.5 rounded-full shadow-xs">
                +₹{Number(receipt.amount || 0).toLocaleString('en-IN')} Credited to Wallet
              </span>
            )}
          </div>
        </div>

        {/* Receipt Details Body (Scrollable) */}
        <div className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto max-h-[50vh]">
          {/* Key Identifiers */}
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500 font-medium">Transaction ID</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-semibold text-gray-900 truncate max-w-[170px] sm:max-w-none">{receipt.id || receipt.transactionId}</span>
                <button
                  onClick={handleCopyId}
                  className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Copy ID"
                  aria-label="Copy Transaction ID"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {receipt.utr && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500 font-medium">Bank UTR / Ref</span>
                <span className="font-mono font-semibold text-gray-800 truncate max-w-[170px] sm:max-w-none">{receipt.utr}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500 font-medium">Date & Time</span>
              <span className="text-gray-700">{receipt.date || new Date().toLocaleString()}</span>
            </div>
          </div>

          {/* Specific Meta Attributes */}
          <div className="divide-y divide-gray-100 text-xs sm:text-sm">
            {receipt.customer && (
              <div className="py-2 flex justify-between gap-2">
                <span className="text-gray-500 shrink-0">Customer</span>
                <span className="font-medium text-gray-900 text-right truncate">{receipt.customer}</span>
              </div>
            )}

            {receipt.biller && (
              <div className="py-2 flex justify-between gap-2">
                <span className="text-gray-500 shrink-0">Biller / Provider</span>
                <span className="font-medium text-gray-900 text-right truncate">{receipt.biller}</span>
              </div>
            )}

            {receipt.consumerNo && (
              <div className="py-2 flex justify-between gap-2">
                <span className="text-gray-500 shrink-0">Identifier / No</span>
                <span className="font-mono font-medium text-gray-900 text-right truncate">{receipt.consumerNo}</span>
              </div>
            )}

            {receipt.terminalId && (
              <div className="py-2 flex justify-between gap-2 items-center">
                <span className="text-gray-500 shrink-0">POS Terminal</span>
                <span className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs font-mono">
                  {receipt.terminalId}
                </span>
              </div>
            )}

            {receipt.beneficiary && (
              <div className="py-2 flex justify-between gap-2">
                <span className="text-gray-500 shrink-0">Beneficiary</span>
                <span className="font-medium text-gray-900 text-right truncate">
                  {receipt.beneficiary}
                  {receipt.accountNumber && (
                    <span className="block text-[11px] text-gray-500 font-mono">{receipt.accountNumber}</span>
                  )}
                </span>
              </div>
            )}

            {receipt.bankName && (
              <div className="py-2 flex justify-between gap-2">
                <span className="text-gray-500 shrink-0">Bank & Method</span>
                <span className="font-medium text-gray-900 text-right truncate">
                  {receipt.bankName} {receipt.method ? `(${receipt.method})` : ''}
                </span>
              </div>
            )}

            {receipt.fee !== undefined && (
              <div className="py-2 flex justify-between">
                <span className="text-gray-500">Service Fee</span>
                <span className="font-medium text-gray-700">₹{receipt.fee}</span>
              </div>
            )}

            <div className="py-2.5 flex justify-between items-center font-bold text-sm sm:text-base text-gray-900">
              <span>Total Paid</span>
              <span>₹{(Number(receipt.amount || 0) + Number(receipt.fee || 0)).toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Notice banner */}
          <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-xl text-blue-800 text-[11px] sm:text-xs">
            <ShieldCheck className="w-4 h-4 shrink-0 text-blue-600" />
            <span>Secured via Bharat BillPay / NPCI switch standards. Prototype demo.</span>
          </div>

          {downloadSuccess && (
            <div className="p-2.5 bg-green-50 text-green-800 rounded-xl text-xs text-center font-medium animate-in fade-in">
              ✓ Demo Receipt downloaded successfully as PDF!
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 bg-gray-50 border-t border-gray-100 space-y-2 shrink-0">
          {receipt.walletCredit && onTransferFunds && (
            <button
              onClick={() => {
                onClose();
                onTransferFunds();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium text-xs sm:text-sm rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-sm transition-all min-h-[44px]"
            >
              <span>Transfer Funds to Beneficiary</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors min-h-[44px]"
            >
              <Download className="w-3.5 h-3.5" />
              Download Receipt
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors min-h-[44px]"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors min-h-[36px] flex items-center justify-center"
          >
            Close Receipt
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
