import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { fetchRotInboxNotifications, markAllRotInboxNotificationsRead, markRotInboxNotificationRead } from "../api/rotApi";

// Sininho de notificacoes generico — nao especifico de nenhum dominio.
// Primeiro consumidor e Seguranca do Trabalho, mas o Operacao nao tinha
// nenhum mecanismo de notificacao interna ate agora; fica pronto pra
// qualquer modulo futuro usar.
export default function NotificationBell() {
	const navigate = useNavigate();
	const [items, setItems] = useState([]);
	const [unreadCount, setUnreadCount] = useState(0);
	const [open, setOpen] = useState(false);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let active = true;
		const load = () => {
			if (document.hidden) return;
			fetchRotInboxNotifications()
				.then((data) => {
					if (!active) return;
					setItems(data.items || []);
					setUnreadCount(data.unreadCount || 0);
					setFailed(false);
				})
				.catch(() => active && setFailed(true));
		};
		load();
		const timer = setInterval(load, 30000);
		return () => {
			active = false;
			clearInterval(timer);
		};
	}, []);

	const openItem = async (item) => {
		setOpen(false);
		if (!item.readAt) {
			markRotInboxNotificationRead(item.id).catch(() => {});
			setItems((current) => current.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)));
			setUnreadCount((current) => Math.max(0, current - 1));
		}
		if (item.deepLink) navigate(item.deepLink);
	};

	const markAll = async () => {
		try {
			await markAllRotInboxNotificationsRead();
			setItems((current) => current.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() })));
			setUnreadCount(0);
		} catch {
			/* silencioso — proxima leitura corrige */
		}
	};

	return (
		<div className="relative shrink-0">
			<button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Notificações" title="Notificações" className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-blue-900">
				<Bell size={19} />
				{unreadCount > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-xs text-white">{unreadCount > 50 ? "50+" : unreadCount}</span> : null}
			</button>
			{open ? (
				<div className="absolute right-0 top-12 z-50 max-h-96 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
					<div className="mb-2 flex items-center justify-between">
						<h3 className="text-sm font-bold text-slate-900">Notificações</h3>
						{unreadCount > 0 ? <button type="button" onClick={markAll} className="text-xs font-bold text-blue-600 hover:text-blue-700">Marcar todas como lidas</button> : null}
					</div>
					{failed ? <p role="alert" className="text-sm text-red-700">Não foi possível atualizar as notificações.</p> : null}
					{!items.length && !failed ? <p className="text-sm text-slate-500">Nenhuma notificação por aqui.</p> : null}
					{items.map((item) => (
						<button key={item.id} type="button" onClick={() => openItem(item)} className={`block w-full border-t border-slate-100 py-3 text-left text-sm first:border-t-0 ${!item.readAt ? "bg-blue-50/50" : ""}`}>
							<b className="block break-words text-slate-900">{item.title}</b>
							{item.body ? <span className="block text-xs text-slate-500">{item.body}</span> : null}
							<span className="mt-0.5 block text-[10px] font-bold uppercase text-slate-400">{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
