import { GstDocumentCategory, GstSupplyType, Prisma } from '@prisma/client';
import { financeSettingsService } from './finance-settings.service.js';
import { apportion, isStructurallyValidGstin, round2, splitTaxAmount, stateCodeFromGstin, taxOn } from './gst-math.js';

// Re-exported so callers keep importing GST helpers from one place.
export { isStructurallyValidGstin, stateCodeFromGstin };

export interface GstSplit {
  taxableValue: number;
  ratePercent: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
  supplyType: GstSupplyType;
}

export interface SplitOptions {
  taxableValue: number;
  ratePercent: number;
  /** Two-digit state code of the place of supply. Falls back to the home state. */
  placeOfSupplyStateCode?: string | null;
  cessPercent?: number;
  /** Pre-computed total tax, when the source document already knows it (existing invoices). */
  knownTaxAmount?: number;
}

/**
 * GST computation, in one place.
 *
 * Everything else in the finance domain asks this service rather than doing its own arithmetic,
 * because the two mistakes that cost money on a GST return — splitting a rate the wrong way, and
 * classifying a supply into the wrong GSTR-1 table — are exactly the mistakes that get repeated
 * when the logic is copy-pasted across modules.
 */
export class GstService {
  async homeStateCode(): Promise<string> {
    return (await financeSettingsService.get()).homeStateCode;
  }

  /** Intra-state when the place of supply matches the company's own state, inter-state otherwise. */
  async supplyTypeFor(placeOfSupplyStateCode?: string | null): Promise<GstSupplyType> {
    const home = await this.homeStateCode();
    if (!placeOfSupplyStateCode) return GstSupplyType.INTRA_STATE;
    return placeOfSupplyStateCode === home ? GstSupplyType.INTRA_STATE : GstSupplyType.INTER_STATE;
  }

  /**
   * Splits a taxable value into CGST/SGST or IGST.
   *
   * Intra-state halves the rate across CGST and SGST, and the halves are computed by taking half
   * of the *total* tax rather than rounding the rate — otherwise a ₹0.01 gap opens on odd amounts
   * and every invoice total is a paisa out.
   */
  async split(options: SplitOptions): Promise<GstSplit> {
    const supplyType = await this.supplyTypeFor(options.placeOfSupplyStateCode);
    const taxableValue = round2(options.taxableValue);
    const ratePercent = options.ratePercent;

    const totalTax =
      options.knownTaxAmount != null
        ? round2(options.knownTaxAmount)
        : taxOn(taxableValue, ratePercent);
    const cess = taxOn(taxableValue, options.cessPercent ?? 0);

    if (ratePercent === 0 || totalTax === 0) {
      return {
        taxableValue,
        ratePercent,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cess,
        total: round2(taxableValue + cess),
        supplyType: ratePercent === 0 ? GstSupplyType.NIL_RATED : supplyType,
      };
    }

    const parts = splitTaxAmount(totalTax, supplyType !== GstSupplyType.INTER_STATE);
    return {
      taxableValue,
      ratePercent,
      ...parts,
      cess,
      total: round2(taxableValue + totalTax + cess),
      supplyType,
    };
  }

  /**
   * Which GSTR-1 table an outward document belongs in.
   *   B2B   — the buyer is GST-registered (any value, any state)
   *   B2CL  — unregistered buyer, inter-state, above the ₹2.5 lakh threshold
   *   B2CS  — everything else unregistered
   */
  async documentCategory(options: {
    buyerGstin?: string | null;
    supplyType: GstSupplyType;
    invoiceTotal: number;
    isCreditNote?: boolean;
  }): Promise<GstDocumentCategory> {
    const registered = Boolean(options.buyerGstin && options.buyerGstin.trim().length >= 15);

    if (options.isCreditNote) {
      return registered ? GstDocumentCategory.CREDIT_NOTE_B2B : GstDocumentCategory.CREDIT_NOTE_B2C;
    }
    if (registered) return GstDocumentCategory.B2B;

    const settings = await financeSettingsService.get();
    const threshold = Number(settings.b2clThreshold);
    if (options.supplyType === GstSupplyType.INTER_STATE && options.invoiceTotal > threshold) {
      return GstDocumentCategory.B2CL;
    }
    return GstDocumentCategory.B2CS;
  }

  /**
   * Apportions a document-level taxable value across its lines so the line amounts always add back
   * to the document total exactly. The last line absorbs the rounding remainder — the standard
   * approach, and the one a CA expects to see.
   */
  apportion(total: number, weights: number[]): number[] {
    return apportion(total, weights);
  }

  /** Convenience for Decimal-typed callers on the write path. */
  toDecimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(round2(value));
  }
}

export const gstService = new GstService();
