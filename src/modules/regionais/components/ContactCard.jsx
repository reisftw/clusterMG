import { useState } from "react";
import { Copy, Check, Phone, Mail, User } from "lucide-react";

const CopyBtn = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="ml-1 p-1 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors shrink-0"
    >
      {copied ? (
        <Check size={11} className="text-green-500" />
      ) : (
        <Copy size={11} />
      )}
    </button>
  );
};

const whatsappUrl = (telefone) => {
  const numero = telefone.replace(/\D/g, "");
  const comDDI = numero.startsWith("55") ? numero : `55${numero}`;
  return `https://wa.me/${comDDI}`;
};

const ContactCard = ({ label, pessoa }) => {
  if (!pessoa?.nome) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-1.5 min-w-0 shadow-sm">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
        {label}
      </p>

      <div className="flex items-center gap-1.5">
        <User size={12} className="text-gray-400 shrink-0" />
        <span className="text-sm font-semibold text-gray-800 truncate">
          {pessoa.nome}
        </span>
        <CopyBtn value={pessoa.nome} />
      </div>

      {pessoa.telefone && (
        <div className="flex items-center gap-1.5">
          <Phone size={12} className="text-gray-400 shrink-0" />
          <a
            href={whatsappUrl(pessoa.telefone)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sm text-green-600 font-medium hover:text-green-700 hover:underline transition-colors"
          >
            {pessoa.telefone}
          </a>
          <CopyBtn value={pessoa.telefone} />
        </div>
      )}

      {pessoa.email && (
        <div className="flex items-center gap-1.5">
          <Mail size={12} className="text-gray-400 shrink-0" />
          <span className="text-sm text-gray-600 truncate">{pessoa.email}</span>
          <CopyBtn value={pessoa.email} />
        </div>
      )}
    </div>
  );
};

export default ContactCard;

