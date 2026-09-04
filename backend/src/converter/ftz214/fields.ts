export type FieldType = 'A' | 'N' | 'AN' | 'D';
export type Designation = 'M' | 'C' | 'O';

export interface AllowedValue {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  description: string;
  type: FieldType;
  maxLength?: number;
  designation: Designation;
  allowedValues?: AllowedValue[];
  hasUnitsAttr?: boolean;
}

// Array order in every FIELDS constant below is the XML element (sequence)
// order from RB_EXAMPLE_214Layout.xml / FTZ 214 Layout.xlsx, NOT grouped by
// designation. xmlBuilder.ts iterates these arrays to emit elements — do not
// re-sort them for readability.

export const APPLICATION_INFO_FIELDS: FieldDef[] = [
  { name: 'CustomerName', label: 'Customer Name', description: 'Name of Importer Submitting the File', type: 'AN', designation: 'M' },
  { name: 'SoftwareProvider', label: 'Software Provider', description: 'Exporter Software Vendor', type: 'AN', designation: 'M' },
  { name: 'CompanyKey', label: 'Company Key', description: 'EDI Company Key assigned by RBSystems/Broker', type: 'AN', maxLength: 6, designation: 'M' },
  { name: 'Module', label: 'Module', description: 'Always "FTZ_214" as value', type: 'AN', designation: 'M' },
  { name: 'Version', label: 'Version', description: 'Always "1.0" as value', type: 'AN', designation: 'M' },
  {
    name: 'Action', label: 'Action', description: 'Add first transmission or Change for corrections', type: 'A', maxLength: 1, designation: 'M',
    allowedValues: [
      { value: 'A', label: 'Add first transmission' },
      { value: 'C', label: 'Change for corrections' },
    ],
  },
];

export const HEADER_FIELDS: FieldDef[] = [
  { name: 'FtzNumber', label: 'FTZ Number', description: 'FTZ Number', type: 'AN', maxLength: 15, designation: 'M' },
  { name: 'ZoneId', label: 'Zone Id', description: 'FTZ Zone Id', type: 'AN', maxLength: 9, designation: 'M' },
  { name: 'ZoneAddress', label: 'Zone Address', description: 'FTZ Zone Address', type: 'AN', maxLength: 50, designation: 'O' },
  { name: 'ZoneCity', label: 'Zone City', description: 'FTZ Zone City', type: 'AN', maxLength: 50, designation: 'O' },
  { name: 'ZoneWhse', label: 'Zone Warehouse', description: 'FTZ Zone Whse', type: 'AN', maxLength: 50, designation: 'O' },
  { name: 'Port', label: 'Port', description: 'FTZ Port Code', type: 'AN', maxLength: 4, designation: 'M' },
  {
    name: 'AdmissionType', label: 'Admission Type', description: 'FTZ Admission Type', type: 'A', maxLength: 1, designation: 'M',
    allowedValues: [
      { value: 'A', label: 'Regular Admission' },
      { value: 'C', label: 'Status Change' },
      { value: 'D', label: 'Domestic' },
      { value: 'O', label: 'Overage Admission' },
      { value: 'T', label: 'Temp Deposit' },
      { value: 'Z', label: 'Zone to Zone' },
    ],
  },
  { name: 'ArrivalDate', label: 'Arrival Date', description: 'FTZ Arrival Date', type: 'D', maxLength: 8, designation: 'M' },
  { name: 'Mot', label: 'Mode of Transportation', description: 'Mode of transportation', type: 'AN', maxLength: 2, designation: 'M' },
  { name: 'ImportingCarrier', label: 'Importing Carrier', description: 'Importing Carrier Scac Code', type: 'AN', maxLength: 4, designation: 'M' },
  { name: 'Trip', label: 'Trip Number', description: 'Trip Number', type: 'AN', maxLength: 15, designation: 'C' },
  { name: 'UnladingPort', label: 'Unlading Port', description: 'US Port of Unlading', type: 'AN', maxLength: 4, designation: 'M' },
  { name: 'Customer', label: 'Customer', description: 'Customer Key', type: 'AN', maxLength: 6, designation: 'M' },
  { name: 'FirmsCode', label: 'Firms Code', description: 'Firms Code', type: 'AN', maxLength: 4, designation: 'C' },
  {
    name: 'DirectDelivery', label: 'Direct Delivery', description: 'Direct Delivery Indicator', type: 'AN', maxLength: 5, designation: 'C',
    allowedValues: [{ value: 'True', label: 'True' }, { value: 'False', label: 'False' }],
  },
  { name: 'ApplicantName', label: 'Applicant Name', description: 'Applicant Name', type: 'AN', maxLength: 50, designation: 'C' },
  { name: 'ZoneOperatorId', label: 'Zone Operator Id', description: 'Zone Operator Id', type: 'AN', maxLength: 12, designation: 'C' },
  { name: 'ImportDate', label: 'Import Date', description: 'FTZ Import Date', type: 'D', maxLength: 8, designation: 'M' },
  { name: 'ExportDate', label: 'Export Date', description: 'FTZ Export Date', type: 'D', maxLength: 8, designation: 'M' },
  { name: 'Description', label: 'Description', description: 'Short Description of Merchandise', type: 'AN', maxLength: 30, designation: 'C' },
];

export const BILL_OF_LADING_FIELDS: FieldDef[] = [
  { name: 'BillNumber', label: 'Bill Number', description: 'Bill of lading Number', type: 'AN', maxLength: 35, designation: 'M' },
  { name: 'HouseBill', label: 'House Bill', description: 'House Bill of lading Number', type: 'AN', maxLength: 12, designation: 'C' },
  { name: 'Qty', label: 'Quantity', description: 'Bill of Lading Qty', type: 'N', maxLength: 10, designation: 'M', hasUnitsAttr: true },
  { name: 'ExportCountry', label: 'Export Country', description: 'Export Country', type: 'A', maxLength: 2, designation: 'M' },
  { name: 'FPortLading', label: 'Foreign Port of Lading', description: 'Foreign port of Lading', type: 'AN', maxLength: 5, designation: 'M' },
  { name: 'InbondCarrier', label: 'Inbond Carrier', description: 'Inbond Carrier Name', type: 'AN', maxLength: 35, designation: 'C' },
  { name: 'InbondNo', label: 'Inbond Number', description: 'Inbond Number', type: 'AN', maxLength: 35, designation: 'C' },
  {
    name: 'InbondType', label: 'Inbond Type', description: 'Inbond Type', type: 'A', maxLength: 2, designation: 'C',
    allowedValues: [{ value: 'IE', label: 'IE' }, { value: 'IT', label: 'IT' }, { value: 'TE', label: 'TE' }],
  },
  { name: 'InbondDate', label: 'Inbond Date', description: 'Inbond Date', type: 'D', maxLength: 8, designation: 'C' },
  { name: 'InbondPort', label: 'Inbond Port', description: 'Inbond Port', type: 'AN', maxLength: 4, designation: 'C' },
  { name: 'Container', label: 'Container', description: 'Container Number', type: 'AN', maxLength: 15, designation: 'C' },
];

export const LINE_FIELDS: FieldDef[] = [
  { name: 'Product', label: 'Product', description: 'Part Numbers', type: 'AN', maxLength: 15, designation: 'M' },
  { name: 'HTS', label: 'HTS', description: 'HTS numbers', type: 'AN', maxLength: 10, designation: 'M' },
  { name: 'OriginCountry', label: 'Origin Country', description: 'Country of Origin', type: 'A', maxLength: 2, designation: 'M' },
  { name: 'Nafta', label: 'Nafta Claim', description: 'For Mexico Nafta claim use "MX"', type: 'A', maxLength: 2, designation: 'C' },
  { name: 'MID', label: 'Manufacturer ID', description: 'Manufacturer ID', type: 'AN', maxLength: 16, designation: 'C' },
  {
    name: 'DisclaimPriorNotice', label: 'Disclaim Prior Notice', description: 'Disclaim Prior Notice', type: 'A', maxLength: 1, designation: 'C',
    allowedValues: [{ value: 'Y', label: 'Yes' }, { value: 'N', label: 'No' }],
  },
  { name: 'Description', label: 'Description', description: 'Product Description', type: 'AN', maxLength: 45, designation: 'M' },
  { name: 'Packages', label: 'Packages', description: 'Product Package', type: 'N', maxLength: 10, designation: 'M', hasUnitsAttr: true },
  { name: 'HtsQty1', label: 'HTS Qty 1', description: 'Qty that is indicated according to HTS', type: 'N', maxLength: 10, designation: 'M', hasUnitsAttr: true },
  { name: 'HtsQty2', label: 'HTS Qty 2', description: 'Qty2 that is indicated according to HTS, if required by HTS', type: 'N', maxLength: 10, designation: 'C', hasUnitsAttr: true },
  { name: 'Value', label: 'Value', description: 'Value', type: 'N', maxLength: 12, designation: 'M' },
  { name: 'Weight', label: 'Weight', description: 'Weight', type: 'N', maxLength: 12, designation: 'M' },
  { name: 'Charges', label: 'Charges', description: 'Freight Charges', type: 'N', maxLength: 10, designation: 'M' },
  { name: 'PkgId', label: 'Package Id', description: 'Package/Box/Plt/Ctn Identifier, up to 30 chars', type: 'AN', maxLength: 30, designation: 'C' },
  { name: 'ZoneStatus', label: 'Zone Status', description: '', type: 'AN', designation: 'O' },
];
