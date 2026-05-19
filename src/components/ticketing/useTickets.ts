import { useContext } from 'react';
import { TicketContext } from './ticket-context-core';

export const useTickets = () => {
  const ctx = useContext(TicketContext);
  if (!ctx) throw new Error('useTickets must be used within TicketProvider');
  return ctx;
};
