import { Router, Request, Response } from 'express';
import { APPLICATION_INFO_FIELDS, HEADER_FIELDS, BILL_OF_LADING_FIELDS, LINE_FIELDS } from '../../converter/ftz214/fields';

const router = Router();

router.get('/', (_req: Request, res: Response): void => {
  res.json({
    applicationInformation: APPLICATION_INFO_FIELDS,
    header: HEADER_FIELDS,
    billOfLading: BILL_OF_LADING_FIELDS,
    line: LINE_FIELDS,
  });
});

export default router;
