import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './components/ctds/Modal';
import { Button } from './components/ctds/Button';

const ConfirmationContext = createContext(null);

export function ConfirmationProvider({ children }) {
  const [pending, setPending] = useState(null);
  const active = useRef(null), mounted = useRef(true);
  const settle = useCallback((accepted, owner) => {
    const current = active.current;
    if (!current || (owner && current.owner !== owner)) return;
    active.current = null;
    if (mounted.current) setPending(null);
    current.resolve(Boolean(accepted));
  }, []);
  const request = useCallback((owner, message, options = {}) => {
    // A second click cannot replace a pending decision or leak its promise.
    if (!mounted.current || active.current) return Promise.resolve(false);
    return new Promise((resolve) => {
      const next = { owner, message, options, resolve, returnFocus: typeof document === 'undefined' ? null : document.activeElement };
      active.current = next;
      setPending(next);
    });
  }, []);
  const cancelOwner = useCallback((owner) => settle(false, owner), [settle]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const current = active.current;
      active.current = null;
      current?.resolve(false);
    };
  }, []);
  const value = useMemo(() => ({ request, cancelOwner }), [request, cancelOwner]);
  return <ConfirmationContext.Provider value={value}>{children}{pending ? <Modal.Root open closeOnOutside onOpenChange={(open) => { if (!open) settle(false); }} hasDescription data-ctds="confirmation" onCloseAutoFocus={(event) => {
    event.preventDefault();
    if (pending.returnFocus?.isConnected) pending.returnFocus.focus?.();
  }}>
    <Modal.Header title={pending.options.title || '계속 진행할까요?'} description={pending.message} dismissible={false} />
    <Modal.Footer>
      <Button type="button" variant="outline" autoFocus onClick={() => settle(false)} data-ctds="button">{pending.options.cancelLabel || '취소'}</Button>
      <Button type="button" variant="primary" onClick={() => settle(true)} data-ctds="button">{pending.options.confirmLabel || '계속'}</Button>
    </Modal.Footer>
  </Modal.Root> : null}</ConfirmationContext.Provider>;
}

export function useConfirm() {
  const context = useContext(ConfirmationContext), owner = useRef(Symbol('confirmation-owner'));
  if (!context) throw new Error('useConfirm requires ConfirmationProvider');
  const { request, cancelOwner } = context;
  useEffect(() => () => cancelOwner(owner.current), [cancelOwner]);
  return useCallback((message, options) => request(owner.current, message, options), [request]);
}
