import cron from 'node-cron';
import { pollFederalRegister } from './federalRegisterPoller';
import { pollCbpCsms } from './cbpCsmsPoller';
import { pollUsitcHts } from './usitcHtsPoller';
import { pollUstr } from './ustrPoller';
import { logger } from '../utils/logger';

function safeRun(name: string, fn: () => Promise<void>): () => void {
  return () => {
    fn().catch((err) => {
      logger.error(`Poller ${name} threw an uncaught error`, { error: String(err) });
    });
  };
}

export function startPollers(): void {
  logger.info('Starting tariff change pollers');

  // Federal Register: every 15 minutes
  cron.schedule('*/15 * * * *', safeRun('federalRegister', pollFederalRegister));

  // CBP CSMS: every 20 minutes
  cron.schedule('*/20 * * * *', safeRun('cbpCsms', pollCbpCsms));

  // USITC HTS: every 30 minutes
  cron.schedule('*/30 * * * *', safeRun('usitcHts', pollUsitcHts));

  // WhiteHouse/USTR: every 30 minutes
  cron.schedule('*/30 * * * *', safeRun('ustr', pollUstr));

  logger.info('All pollers scheduled', {
    federalRegister: '*/15 * * * *',
    cbpCsms: '*/20 * * * *',
    usitcHts: '*/30 * * * *',
    ustr: '*/30 * * * *',
  });

  // Run initial polls on startup with a short stagger to avoid thundering herd
  setTimeout(safeRun('federalRegister', pollFederalRegister), 5_000);
  setTimeout(safeRun('cbpCsms', pollCbpCsms), 15_000);
  setTimeout(safeRun('usitcHts', pollUsitcHts), 30_000);
  setTimeout(safeRun('ustr', pollUstr), 45_000);
}
