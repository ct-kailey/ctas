import React, { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Input as CTDSInput } from './components/ctds/Input/Input';
import { Textarea as CTDSTextarea } from './components/ctds/Textarea/Textarea';
import { Checkbox as CTDSCheckbox } from './components/ctds/Checkbox/Checkbox';
import { Radio as CTDSRadio } from './components/ctds/Radio/Radio';
import { Select as CTDSSelect } from './components/ctds/Select/Select';
import { Disclosure as CTDSDisclosure } from './components/ctds/Disclosure/Disclosure';
import { Button as CTDSButton } from './components/ctds/Button/Button';
import { Tabs as CTDSTabs } from './components/ctds/Tabs/Tabs';
import './ui-controls.css';

function assignRef(ref, node) {
  if (typeof ref === 'function') ref(node);
  else if (ref) ref.current = node;
}

export const Input = forwardRef(function Input({ type = 'text', className, controlSize = 'sm', variant = 'outline', ...props }, ref) {
  if (type === 'checkbox') return <CTDSCheckbox {...props} ref={ref} as="span" className={className} data-ctds-control="checkbox" />;
  if (type === 'radio') return <CTDSRadio {...props} ref={ref} as="span" className={className} data-ctds-control="radio" />;
  // Hidden transport inputs have no visual equivalent; they remain native form data.
  if (type === 'hidden') return <input {...props} ref={ref} type="hidden" className={className} data-ctds-control="hidden" />;
  const { id, value, defaultValue, disabled, readOnly, required, onChange, ...nativeProps } = props;
  return <CTDSInput type={type} id={id} value={value} defaultValue={defaultValue} disabled={disabled} readOnly={readOnly}
    required={required} onChange={onChange} className={className} size={controlSize} variant={variant} inputRef={ref}
    inputProps={{ ...nativeProps, 'data-ctds-control': type === 'file' ? 'file' : 'input' }} />;
});

export const Textarea = forwardRef(function Textarea({ controlSize = 'sm', ...props }, ref) {
  return <CTDSTextarea size={controlSize} autoResize={false} showCount={props.maxLength != null} {...props} ref={ref} data-ctds-control="textarea" />;
});

function optionText(children) {
  return React.Children.toArray(children).map(child => React.isValidElement(child) ? optionText(child.props.children) : String(child)).join('');
}
function flattenOptions(children, group = null, inheritedDisabled = false, result = []) {
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) flattenOptions(child.props.children, group, inheritedDisabled, result);
    else if (child.type === 'optgroup') flattenOptions(child.props.children, child.props.label, inheritedDisabled || child.props.disabled, result);
    else if (child.type === 'option') result.push({
      value: String(child.props.value ?? optionText(child.props.children)), label: child.props.label ?? optionText(child.props.children),
      disabled: Boolean(inheritedDisabled || child.props.disabled), hidden: Boolean(child.props.hidden), group,
    });
  });
  return result;
}

// The native select is the single form-data and validation authority. The visible control is CTDS/Radix.
export const Select = forwardRef(function Select({ children, className, id: suppliedId, value, defaultValue, name, form, required,
  disabled, onChange, onInput, onInvalid, onFocus, onBlur, controlSize = 'sm', variant = 'outline', multiple, ...props }, ref) {
  const generatedId = useId(), id = suppliedId || generatedId;
  const nativeRef = useRef(null), triggerRef = useRef(null);
  const options = flattenOptions(children);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (value !== undefined || defaultValue !== undefined) return options.findIndex(option => option.value === String(value ?? defaultValue));
    return options.findIndex(option => !option.disabled);
  });
  const [invalid, setInvalid] = useState(false), [open, setOpen] = useState(false), [fieldsetDisabled, setFieldsetDisabled] = useState(false);
  const setNativeRef = useCallback(node => { nativeRef.current = node; assignRef(ref, node); }, [ref]);
  const sync = useCallback(() => {
    const node = nativeRef.current;
    if (!node) return;
    setSelectedIndex(node.selectedIndex);
    setFieldsetDisabled(node.matches(':disabled'));
    if (node.validity.valid) setInvalid(false);
  }, []);
  // Native React semantics decide first-option fallback, changed options and controlled values.
  useLayoutEffect(sync);
  useEffect(() => {
    const node = nativeRef.current, owner = node?.form;
    if (!node || !owner) return;
    const reset = event => queueMicrotask(() => {
      if (event.defaultPrevented || !node.isConnected) return;
      if (value !== undefined) node.value = String(value);
      setInvalid(false); setOpen(false); sync();
    });
    owner.addEventListener('reset', reset);
    return () => owner.removeEventListener('reset', reset);
  }, [value, form, sync]);
  useEffect(() => { if (disabled || fieldsetDisabled) setOpen(false); }, [disabled, fieldsetDisabled]);
  const choose = encoded => {
    const node = nativeRef.current, index = Number(encoded.slice('option-'.length));
    if (!node || node.matches(':disabled') || !Number.isInteger(index) || !options[index] || options[index].disabled) return;
    if (node.selectedIndex === index) return;
    node.selectedIndex = index;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
  };
  if (multiple) throw new Error('AINS Select supports one value; use a labelled Checkbox group for multiple values.');
  const groups = [];
  options.forEach((option, index) => {
    if (option.hidden) return;
    let current = groups[groups.length - 1];
    if (!current || current.label !== option.group) { current = { label: option.group, options: [] }; groups.push(current); }
    current.options.push({ ...option, index });
  });
  const { size: nativeSize, autoComplete, autoFocus, onKeyDown, onKeyUp, onClick, style, ...ariaProps } = props;
  return <span className="ains-select" data-ctds="select" onChangeCapture={event => {
    // Radix owns an unnamed native helper; only our real select may notify the form.
    if (event.target !== nativeRef.current) event.stopPropagation();
  }}>
    <CTDSSelect size={controlSize} variant={variant} id={id} disabled={disabled || fieldsetDisabled} invalid={invalid || props['aria-invalid'] === true || props['aria-invalid'] === 'true'}
      value={selectedIndex < 0 ? '' : `option-${selectedIndex}`} onValueChange={choose} open={open} onOpenChange={setOpen}
      form={`${generatedId}-visual-only`}>
      <CTDSSelect.Trigger ref={triggerRef} {...ariaProps} data-ctds="select-trigger" data-ctds-control="select-trigger" className={className} style={style}
        autoFocus={autoFocus} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} onKeyUp={onKeyUp} onClick={onClick} aria-required={required || undefined}>
        {selectedIndex >= 0 ? options[selectedIndex]?.label : props.placeholder || '선택하세요'}
      </CTDSSelect.Trigger>
      <CTDSSelect.Content data-ctds="select-content">
        {groups.map((group, groupIndex) => <CTDSSelect.Group key={groupIndex} data-ctds="select-group">
          {group.label != null ? <CTDSSelect.Label data-ctds="select-label">{group.label}</CTDSSelect.Label> : null}
          {group.options.map(option => <CTDSSelect.Item key={option.index} value={`option-${option.index}`} disabled={option.disabled} textValue={String(option.label)} data-ctds="select-option">{option.label || '선택 안 함'}</CTDSSelect.Item>)}
        </CTDSSelect.Group>)}
      </CTDSSelect.Content>
    </CTDSSelect>
    <select ref={setNativeRef} className="visually-hidden" data-ctds-control="select-transport" aria-hidden="true" tabIndex={-1} id={`${id}-native`}
      name={name} form={form} required={required} disabled={disabled} value={value} defaultValue={defaultValue} size={nativeSize} autoComplete={autoComplete}
      onFocus={() => triggerRef.current?.focus()} onInput={onInput} onChange={event => { sync(); onChange?.(event); }}
      onInvalid={event => { setInvalid(true); triggerRef.current?.focus(); onInvalid?.(event); }}>
      {children}
    </select>
  </span>;
});

export const ControlButton = forwardRef(function ControlButton({ children, type = 'submit', variant = 'ghost', size = 'sm', layout = 'content', ...props }, ref) {
  return <CTDSButton asChild size={size} variant={variant} layout={layout} data-ctds="button"><button {...props} ref={ref} type={type}>{children}</button></CTDSButton>;
});

export const Disclosure = forwardRef(function Disclosure({ children, open, defaultOpen = false, onOpenChange, onToggle, onInvalidCapture, ...props }, ref) {
  const rootRef = useRef(null), [state, setState] = useState(open ?? defaultOpen);
  const previousOpen = useRef(open);
  // <details open> remains user-toggleable; later changes to the open prop still synchronize.
  useEffect(() => { if (previousOpen.current !== open) { previousOpen.current = open; if (open !== undefined) setState(open); } }, [open]);
  const controlled = open !== undefined && onOpenChange !== undefined;
  const isOpen = controlled ? open : state;
  const setRootRef = useCallback(node => { rootRef.current = node; assignRef(ref, node); }, [ref]);
  const change = next => {
    if (!controlled) setState(next);
    if (rootRef.current) rootRef.current.open = next;
    onOpenChange?.(next);
    onToggle?.({ type: 'toggle', target: rootRef.current, currentTarget: rootRef.current, newState: next ? 'open' : 'closed', oldState: isOpen ? 'open' : 'closed' });
  };
  const parts = React.Children.toArray(children), index = parts.findIndex(child => React.isValidElement(child) && child.type === 'summary');
  const summary = index < 0 ? null : parts[index];
  return <CTDSDisclosure {...props} ref={setRootRef} open={isOpen} onOpenChange={change} onInvalidCapture={event => {
    onInvalidCapture?.(event);
    // Reveal required controls before the browser's constraint-validation focus step.
    if (!isOpen) flushSync(() => change(true));
  }}>
    <CTDSDisclosure.Trigger {...summary?.props} data-ctds="disclosure-trigger">{summary?.props.children || '자세히 보기'}</CTDSDisclosure.Trigger>
    <CTDSDisclosure.Body>{parts.filter((_, childIndex) => childIndex !== index)}</CTDSDisclosure.Body>
  </CTDSDisclosure>;
});

const TabsRoot = forwardRef((props, ref) => <CTDSTabs {...props} ref={ref} data-ctds="tabs" />);
TabsRoot.displayName = 'Tabs';
export const Tabs = Object.assign(TabsRoot, {
  List: forwardRef((props, ref) => <CTDSTabs.List {...props} ref={ref} data-ctds="tabs-list" />),
  Trigger: forwardRef((props, ref) => <CTDSTabs.Trigger {...props} ref={ref} data-ctds="tabs-trigger" />),
  Panel: forwardRef((props, ref) => <CTDSTabs.Panel {...props} ref={ref} data-ctds="tabs-panel" />),
});
