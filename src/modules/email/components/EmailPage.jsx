import React, { useState } from 'react';
import { Mail, Copy } from 'lucide-react';

const EmailPage = () => {
  const [linkLojas, setLinkLojas] = useState('https://sempreinternet.com.br/lojas');
  const [copied, setCopied] = useState(false);

  const logoHeader = '/logo-sempre-negativa.webp';
  const logoColorida = '/logo-colorida.png';

  const htmlEmail = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f0f3f8;">
<div style="background:#f0f3f8;border:1.5px solid #DDE3EE;border-radius:14px;overflow:hidden;max-width:680px;margin:20px auto;font-family:Arial,Helvetica,sans-serif;">
  <div style="background:#003087;padding:18px 32px;display:flex;align-items:center;justify-content:space-between;">
    <img src="${logoHeader}" alt="Sempre Internet" style="height:42px;" />
    <div style="text-align:right;">
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.9);font-weight:700;">Suporte ao Cliente</p>
      <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.55);">Retirada de Equipamento</p>
    </div>
  </div>
  <div style="padding:32px 36px;background:white;">
    <div style="background:linear-gradient(135deg,#002570,#0044AA);border-radius:12px;padding:30px 32px;margin-bottom:28px;color:white;border-left:5px solid #FF6B00;">
      <span style="display:inline-block;background:#FF6B00;color:white;font-size:10px;font-weight:700;padding:5px 13px;border-radius:20px;margin-bottom:14px;text-transform:uppercase;">⚠️ Pendência de Devolução</span>
      <h1 style="margin:0 0 8px;font-size:21px;font-weight:700;">Equipamento Sempre Internet</h1>
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.82);line-height:1.65;">Identificamos um equipamento que ainda não foi devolvido.</p>
    </div>
    <p style="font-size:14px;color:#2c3e50;line-height:1.8;"><strong style="color:#003087;">Prezado(a) Cliente,</strong></p>
    <p style="font-size:14px;color:#2c3e50;line-height:1.8;margin-bottom:18px;">A <strong style="color:#003087;">Sempre Internet</strong> solicita a devolução do equipamento em comodato.</p>
    <div style="background:#FFF8F0;border-left:4px solid #FF6B00;border-radius:0 10px 10px 0;padding:16px 20px;margin:22px 0;font-size:13px;color:#2c3e50;">
      📄 Equipamentos são fornecidos em regime de <strong>comodato</strong> e devem ser devolvidos.
    </div>
    <div style="background:linear-gradient(135deg,#002570,#0052CC);border-radius:12px;padding:22px 28px;text-align:center;margin:24px 0;">
      <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0 0 14px 0;">Unidade mais próxima</p>
      <a href="${linkLojas}" style="display:inline-block;background:#FF6B00;color:white;font-weight:700;font-size:13px;padding:12px 30px;border-radius:8px;text-decoration:none;">🗺️ Ver Lojas</a>
    </div>
    <div style="height:1px;background:#DDE3EE;margin:26px 0;"></div>
    <p style="font-size:14px;color:#2c3e50;line-height:1.8;">Responda este e-mail com:</p>
    <table style="border:1.5px solid #DDE3EE;border-radius:12px;overflow:hidden;margin:16px 0;width:100%;">
      <tr><td style="background:#003087;color:white;padding:13px 18px;font-weight:700;">📞 Opção 1 - Visita Técnica</td></tr>
      <tr><td style="padding:18px;background:white;font-size:13px;color:#2c3e50;">
        Nome / Cidade / Telefone / Data disponível
      </td></tr>
    </table>
    <table style="border:1.5px solid #DDE3EE;border-radius:12px;overflow:hidden;margin:16px 0;width:100%;">
      <tr><td style="background:#00875A;color:white;padding:13px 18px;font-weight:700;">✅ Opção 2 - Já Devolvido</td></tr>
      <tr><td style="padding:18px;background:white;font-size:13px;color:#2c3e50;">
        Nome / Cidade / Data devolução / Protocolo
      </td></tr>
    </table>
    <div style="display:flex;align-items:center;gap:16px;padding:20px 0;">
      <img src="${logoColorida}" alt="Sempre Internet" style="height:32px;" />
      <div>
        <p style="margin:0;font-size:13px;color:#2c3e50;"><strong>Equipe Sempre Internet</strong></p>
      </div>
    </div>
  </div>
  <div style="background:#F0F3F8;padding:18px 36px;border-top:1px solid #DDE3EE;text-align:center;font-size:11px;color:#6B7897;">
    <a href="${linkLojas}" style="color:#003087;">${linkLojas}</a>
  </div>
</div></body></html>`.trim();

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(htmlEmail);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = htmlEmail;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <Mail className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold">E-mail em Massa</h2>
          <p className="text-sm text-gray-500">Gerador de email marketing</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border p-6">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Link Lojas</label>
          <input type="url" value={linkLojas} onChange={e => setLinkLojas(e.target.value)}
            className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="relative">
          <div className="p-4 border rounded-xl bg-gray-50 max-h-96 overflow-auto font-mono text-xs"
            dangerouslySetInnerHTML={{ __html: htmlEmail }} />
          <button onClick={copyEmail} className={`absolute top-2 right-2 px-3 py-1 rounded-lg text-xs font-medium ${copied ? 'bg-green-500' : 'bg-blue-600 hover:bg-blue-700'} text-white flex items-center gap-1`}>
            {copied ? '✅ Copiado!' : <><Copy size={12} /> Copiar</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailPage;