// The QR code on the manual payment screen: the admin's own uploaded picture when there is one, otherwise a QR code made from the UPI link.
import QrCode from '../../shared/ui/QrCode';
import { api } from '../../shared/data';
import { useAsync } from '../../shared/lib/useAsync';
import { useLang } from '../../shared/i18n/LangContext';
import { useSettings } from '../../shared/settings/SettingsContext';

/** `info` is the result of paymentInfo(); `amount` the price as text. */
export default function ManualQr({ info, amount }) {
  const { t } = useLang();
  const { settings } = useSettings();
  const shop = useAsync(async () => (settings.qrPath ? api.getShopQrUrl(settings.qrPath) : ''), [settings.qrPath]);
  const shopUrl = shop.data || '';
  return (
    <div className="pay-qr">
      {shopUrl ? (
        <>
          <img className="qr" src={shopUrl} alt={t.qrAlt} width={240} height={240} referrerPolicy="no-referrer" />
          <p className="help">{t.payQrShopHelp(amount, info.reference)}</p>
        </>
      ) : (
        <>
          <QrCode value={info.upiLink} label={t.payQrLabel(amount, info.upiName)} />
          <p className="help">{t.payQrHelp}</p>
        </>
      )}
    </div>
  );
}
