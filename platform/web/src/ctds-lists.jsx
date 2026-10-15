import React, { forwardRef } from 'react';
import './ctds-lists.css';
import { ListItem as CTDSListItem } from './components/ctds/ListItem/ListItem';

// Application semantics only. CTDS owns row spacing, content slots and interaction chrome.
export const List = forwardRef(function List({ children, ...props }, ref) {
  return <div role="list" {...props} ref={ref}>{children}</div>;
});

export const ListItem = forwardRef(function ListItem({ size = 'sm', align = 'top', className = '', ...props }, ref) {
  return <CTDSListItem data-ctds="list-item" className={`ains-list-item ${className}`} role="listitem" size={size} align={align} {...props} ref={ref} />;
});
ListItem.Title = CTDSListItem.Title;
ListItem.Description = CTDSListItem.Description;
// Wrap long Korean metadata and action groups without replacing the vendor's spacing.
ListItem.Meta = forwardRef(function ListItemMeta({ style, ...props }, ref) {
  return <CTDSListItem.Meta {...props} ref={ref} style={{ flexWrap: 'wrap', ...style }} />;
});
ListItem.MetaDivider = CTDSListItem.MetaDivider;
