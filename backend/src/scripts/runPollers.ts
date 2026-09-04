/**
 * One-shot script — runs all four pollers immediately and exits.
 * Usage: npm run pollers:run
 */
import { pollFederalRegister } from '../pollers/federalRegisterPoller';
import { pollCbpCsms } from '../pollers/cbpCsmsPoller';
import { pollUstr } from '../pollers/ustrPoller';
import { pollUsitcHts } from '../pollers/usitcHtsPoller';

async function run() {
  console.log('═══════════════════════════════════════');
  console.log('  JD Tariff Monitor — Manual Poll Run  ');
  console.log('═══════════════════════════════════════\n');

  const tasks: Array<{ name: string; fn: () => Promise<void> }> = [
    { name: 'Federal Register (USTR / ITA)',  fn: pollFederalRegister },
    { name: 'CBP CSMS RSS Feed',              fn: pollCbpCsms },
    { name: 'White House / USTR RSS',         fn: pollUstr },
    { name: 'USITC HTS Rate Data',            fn: pollUsitcHts },
  ];

  for (const task of tasks) {
    process.stdout.write(`⏳  ${task.name} … `);
    const start = Date.now();
    try {
      await task.fn();
      const ms = Date.now() - start;
      console.log(`✓  (${ms}ms)`);
    } catch (err) {
      console.log(`✗  ERROR`);
      console.error(`   ${String(err)}\n`);
    }
  }

  console.log('\n✅  All pollers finished. Check the dashboard for new changes.');
  process.exit(0);
}

run();
