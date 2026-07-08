import { AesListRow } from '@/types/aes.types'
import { randomDateInLastNDays } from '@/utils/dateUtils'

const partNumbers = [
  '5146091-00', '5154859-00', '5162347-00', '5178234-00',
  'EON ONE COMPACT-NA', 'JBL-PRX ONE-NA', 'CONTROL 28-1',
  'GIT9000HD', 'SRX900LA-NA', 'EON715-NA', 'PRX425-NA',
  'VRX932LA-NA', 'SRX835P-NA', 'EON618S-NA', 'JBL-MRX500',
  'CONTROL 30-1', 'SRX812P-NA', 'PRX815W-NA', 'EON208P-NA',
]

const sedStatuses = ['ACCEPTED', 'FILED', 'PENDING', 'REJECTED', 'AES DOWN']
const severities = ['', 'LOW', 'MEDIUM', 'HIGH']
const motTypes = ['SEDT', 'SEDT', 'SEDT', 'SEDT', 'EXSV']
const scacCodes = ['DHLG', 'UPSN', 'FXFE', 'MSCU', 'MAEU']

function generateITN(dateStr: string): string {
  if (Math.random() > 0.3) return ''
  const d = dateStr.replace(/\//g, '')
  const [m, day, y] = [d.slice(0, 2), d.slice(2, 4), d.slice(4)]
  const seq = String(Math.floor(Math.random() * 999999)).padStart(6, '0')
  return `X${y}${m}${day}${seq}`
}

function generateRef(): string {
  if (Math.random() > 0.5) {
    return `MQ3${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`
  }
  return `LV${String(Math.floor(Math.random() * 9999999)).padStart(7, '0')}`
}

export const aesListMockData: AesListRow[] = Array.from({ length: 50 }, (_, i) => {
  const estExpDate = randomDateInLastNDays(30)
  const mot = motTypes[Math.floor(Math.random() * motTypes.length)]
  const partNumber = partNumbers[Math.floor(Math.random() * partNumbers.length)]
  const value = parseFloat((Math.random() * 1290 + 6).toFixed(2))
  const sedStatus = sedStatuses[Math.floor(Math.random() * sedStatuses.length)]
  const itn = generateITN(estExpDate)
  const severity = severities[Math.floor(Math.random() * severities.length)]

  return {
    id: `aes-${i + 1}`,
    reference: generateRef(),
    mot,
    scac: scacCodes[Math.floor(Math.random() * scacCodes.length)],
    unladingPort: Math.random() > 0.2 ? 'MEXICO BAJA CALIFORNIA NORTE' : '',
    estExpDate,
    exporter: 'HARMAN PROFESSIONAL INC D/HARMAN P.TIJ',
    consignee: 'HARMAN DE MEXICO S DE RL DE CV',
    port: '2506',
    sedStatus,
    severity,
    partNumber,
    value,
    itn,
    traffic: `TRF${String(Math.floor(Math.random() * 9999999)).padStart(7, '0')}`,
    // hidden columns
    action: '',
    arInvoice: `INV-${Math.floor(Math.random() * 99999)}`,
    consigneeId: 'HMX001',
    countryDest: 'MX',
    created: randomDateInLastNDays(60),
    equipment: mot === 'SEDT' ? `CONT${Math.floor(Math.random() * 9999999)}` : '',
    exporterId: 'HPRO001',
    fillOption: 'PRE-DEPARTURE',
    hazardous: Math.random() > 0.9 ? 'Y' : 'N',
    inbondCode: '',
    license: Math.random() > 0.7 ? 'NLR' : 'EAR99',
    origin: 'US',
    stateDest: 'MX',
    user: 'JCANALES',
  }
})
