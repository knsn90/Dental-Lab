/**
 * UBL-TR 2.1 XML Builder — TR e-Fatura standardı
 *
 * Çekirdek bir builder — tüm alanlar minimal ama GİB-uyumlu.
 * Provider'lar bu XML'i alıp kendi endpoint'lerine yollar.
 *
 * Spesifikasyon: GİB UBL-TR 2.1 Kılavuzu
 *   https://efatura.gov.tr/teknikspecler.html
 *
 * NOT: Production'da UBL validator çalıştırılmalı (xsd doğrulama).
 *      Bu builder %95'lik vakaları kapsar; istisnai senaryolar için
 *      provider-specific override gerekebilir.
 */
import type { EFaturaInvoice, EFaturaLineItem } from './types';

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtAmount(n: number): string {
  return n.toFixed(2);
}

function buildLineItem(item: EFaturaLineItem, index: number): string {
  const lineExtension = (item.unit_price * item.quantity) - (item.discount ?? 0);
  const taxAmount     = lineExtension * (item.tax_rate / 100);
  const totalAmount   = lineExtension + taxAmount;

  return `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(item.unit)}">${fmtAmount(item.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="TRY">${fmtAmount(lineExtension)}</cbc:LineExtensionAmount>
    ${item.discount ? `
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:Amount currencyID="TRY">${fmtAmount(item.discount)}</cbc:Amount>
    </cac:AllowanceCharge>` : ''}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="TRY">${fmtAmount(taxAmount)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="TRY">${fmtAmount(lineExtension)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="TRY">${fmtAmount(taxAmount)}</cbc:TaxAmount>
        <cbc:Percent>${fmtAmount(item.tax_rate)}</cbc:Percent>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${esc(item.description)}</cbc:Name>
      ${item.hs_code ? `<cac:CommodityClassification><cbc:ItemClassificationCode listID="GTIP">${esc(item.hs_code)}</cbc:ItemClassificationCode></cac:CommodityClassification>` : ''}
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="TRY">${fmtAmount(item.unit_price)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
}

export function buildUblXml(invoice: EFaturaInvoice): string {
  const totals = invoice.items.reduce((acc, it) => {
    const line = (it.unit_price * it.quantity) - (it.discount ?? 0);
    const tax  = line * (it.tax_rate / 100);
    return {
      line:  acc.line + line,
      tax:   acc.tax + tax,
      total: acc.total + line + tax,
    };
  }, { line: 0, tax: 0, total: 0 });

  const profile = invoice.type === 'e_arsiv' ? 'EARSIVFATURA' : 'TICARIFATURA';
  const issueTime = new Date().toISOString().slice(11, 19); // HH:MM:SS

  // Customer party — corporate (VKN 10 hane) veya individual (TCKN 11 hane)
  const customerIdScheme = invoice.customer.type === 'corporate' ? 'VKN' : 'TCKN';
  const customerId = invoice.customer.vkn || invoice.customer.tckn || '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice
  xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">

  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${profile}</cbc:ProfileID>
  <cbc:ID>${esc(invoice.invoice_number)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${crypto.randomUUID ? crypto.randomUUID() : 'PROVIDER-WILL-FILL'}</cbc:UUID>
  <cbc:IssueDate>${esc(invoice.issue_date)}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  ${invoice.notes ? `<cbc:Note>${esc(invoice.notes)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${invoice.items.length}</cbc:LineCountNumeric>

  <!-- Supplier (Lab) -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${esc(invoice.lab.vkn)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${esc(invoice.lab.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(invoice.lab.address)}</cbc:StreetName>
        ${invoice.lab.district ? `<cbc:CitySubdivisionName>${esc(invoice.lab.district)}</cbc:CitySubdivisionName>` : ''}
        ${invoice.lab.city ? `<cbc:CityName>${esc(invoice.lab.city)}</cbc:CityName>` : ''}
        ${invoice.lab.postal_code ? `<cbc:PostalZone>${esc(invoice.lab.postal_code)}</cbc:PostalZone>` : ''}
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme><cbc:Name>${esc(invoice.lab.tax_office)}</cbc:Name></cac:TaxScheme>
      </cac:PartyTaxScheme>
      ${invoice.lab.phone ? `<cac:Contact><cbc:Telephone>${esc(invoice.lab.phone)}</cbc:Telephone>${invoice.lab.email ? `<cbc:ElectronicMail>${esc(invoice.lab.email)}</cbc:ElectronicMail>` : ''}</cac:Contact>` : ''}
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- Customer -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${customerIdScheme}">${esc(customerId)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${esc(invoice.customer.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(invoice.customer.address)}</cbc:StreetName>
        ${invoice.customer.district ? `<cbc:CitySubdivisionName>${esc(invoice.customer.district)}</cbc:CitySubdivisionName>` : ''}
        ${invoice.customer.city ? `<cbc:CityName>${esc(invoice.customer.city)}</cbc:CityName>` : ''}
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      ${invoice.customer.tax_office ? `<cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${esc(invoice.customer.tax_office)}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- Tax Total -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">${fmtAmount(totals.tax)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">${fmtAmount(totals.line)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">${fmtAmount(totals.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <!-- Legal Monetary Total -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">${fmtAmount(totals.line)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TRY">${fmtAmount(totals.line)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">${fmtAmount(totals.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="TRY">${fmtAmount(totals.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${invoice.items.map((it, i) => buildLineItem(it, i)).join('')}
</Invoice>`;
}
