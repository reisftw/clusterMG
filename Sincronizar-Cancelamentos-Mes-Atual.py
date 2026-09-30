import os
import queue
import socket
import subprocess
import sys
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk


REPO_ROOT = Path(__file__).resolve().parent
NODE_SCRIPT = REPO_ROOT / "apps" / "retiradas" / "backend" / "scripts" / "sync-cancellations-local.js"
SSH_KEY = Path.home() / ".ssh" / "retiradas_github_actions_deploy"
SSH_TARGET = "root@145.223.27.204"
REMOTE_ENV_FILE = "/etc/retiradas/api.env"
LOCAL_PORT = 15432


class SyncApp:
	def __init__(self, root):
		self.root = root
		self.root.title("Retiradas - Sincronizar Cancelamentos")
		self.root.geometry("860x560")
		self.root.minsize(760, 480)
		self.log_queue = queue.Queue()
		self.tunnel_process = None

		self.status_var = tk.StringVar(value="Pronto para sincronizar o mês atual.")
		self.month_var = tk.StringVar(value="current")

		container = ttk.Frame(root, padding=18)
		container.pack(fill=tk.BOTH, expand=True)

		title = ttk.Label(
			container,
			text="Sincronizar Cancelamentos",
			font=("Segoe UI", 18, "bold"),
		)
		title.pack(anchor="w")

		description = ttk.Label(
			container,
			text=(
				"Este computador consulta o BI HubSoft e grava o resultado no banco do Retiradas. "
				"Use current para atualizar o mês atual ou informe YYYY-MM."
			),
			wraplength=780,
		)
		description.pack(anchor="w", pady=(4, 16))

		form = ttk.Frame(container)
		form.pack(fill=tk.X)
		ttk.Label(form, text="Competência:").pack(side=tk.LEFT)
		self.month_entry = ttk.Entry(form, textvariable=self.month_var, width=14)
		self.month_entry.pack(side=tk.LEFT, padx=(8, 12))
		self.start_button = ttk.Button(form, text="Atualizar", command=self.start_sync)
		self.start_button.pack(side=tk.LEFT)
		self.close_button = ttk.Button(form, text="Fechar", command=self.root.destroy)
		self.close_button.pack(side=tk.RIGHT)

		self.progress = ttk.Progressbar(container, mode="indeterminate")
		self.progress.pack(fill=tk.X, pady=(16, 8))

		self.status_label = ttk.Label(container, textvariable=self.status_var, font=("Segoe UI", 10, "bold"))
		self.status_label.pack(anchor="w", pady=(0, 8))

		log_frame = ttk.Frame(container)
		log_frame.pack(fill=tk.BOTH, expand=True)
		self.log = tk.Text(log_frame, height=18, wrap=tk.WORD, state=tk.DISABLED)
		scroll = ttk.Scrollbar(log_frame, orient=tk.VERTICAL, command=self.log.yview)
		self.log.configure(yscrollcommand=scroll.set)
		self.log.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
		scroll.pack(side=tk.RIGHT, fill=tk.Y)

		self.root.protocol("WM_DELETE_WINDOW", self.on_close)
		self.root.after(100, self.drain_log_queue)

	def append_log(self, text):
		self.log_queue.put(text)

	def drain_log_queue(self):
		while True:
			try:
				text = self.log_queue.get_nowait()
			except queue.Empty:
				break
			self.log.configure(state=tk.NORMAL)
			self.log.insert(tk.END, text)
			self.log.see(tk.END)
			self.log.configure(state=tk.DISABLED)
		self.root.after(100, self.drain_log_queue)

	def set_running(self, running):
		if running:
			self.start_button.configure(state=tk.DISABLED)
			self.month_entry.configure(state=tk.DISABLED)
			self.close_button.configure(state=tk.DISABLED)
			self.progress.start(12)
		else:
			self.start_button.configure(state=tk.NORMAL)
			self.month_entry.configure(state=tk.NORMAL)
			self.close_button.configure(state=tk.NORMAL)
			self.progress.stop()

	def start_sync(self):
		self.set_running(True)
		self.status_var.set("Iniciando sincronização...")
		threading.Thread(target=self.run_sync, daemon=True).start()

	def run_sync(self):
		try:
			self.validate_dependencies()
			competencia = self.month_var.get().strip() or "current"
			self.append_log(f"Competência selecionada: {competencia}\n")
			self.append_log("Lendo credenciais do banco na VPS...\n")
			env = self.read_database_env()
			self.open_tunnel_if_needed()
			self.run_node_sync(competencia, env)
			self.status_var.set("Sincronização concluída. Pode fechar esta janela.")
			self.append_log("\nSincronização concluída com sucesso.\n")
			messagebox.showinfo("Sincronização concluída", "Cancelamentos atualizados com sucesso.")
		except Exception as exc:
			self.status_var.set("Falha na sincronização. Veja o log abaixo.")
			self.append_log(f"\nERRO: {exc}\n")
			messagebox.showerror("Falha na sincronização", str(exc))
		finally:
			self.close_tunnel()
			self.root.after(0, lambda: self.set_running(False))

	def validate_dependencies(self):
		if not SSH_KEY.exists():
			raise RuntimeError(f"Chave SSH não encontrada: {SSH_KEY}")
		if not NODE_SCRIPT.exists():
			raise RuntimeError(f"Script interno não encontrado: {NODE_SCRIPT}")
		self.run_command(["ssh.exe", "-V"], capture=True, check=False)
		self.run_command(["node.exe", "-v"], capture=True, check=True)

	def run_command(self, args, capture=False, check=True, env=None):
		result = subprocess.run(
			args,
			cwd=str(REPO_ROOT),
			text=True,
			encoding="utf-8",
			errors="replace",
			capture_output=capture,
			env=env,
		)
		if check and result.returncode != 0:
			output = (result.stderr or result.stdout or "").strip()
			raise RuntimeError(output or f"Comando falhou: {' '.join(args)}")
		return result

	def ssh_output(self, remote_command):
		result = self.run_command(
			[
				"ssh.exe",
				"-i",
				str(SSH_KEY),
				"-o",
				"ServerAliveInterval=30",
				"-o",
				"ServerAliveCountMax=10",
				SSH_TARGET,
				remote_command,
			],
			capture=True,
			check=True,
		)
		return (result.stdout or "").strip()

	def read_remote_env_value(self, name):
		command = f"grep -E '^{name}=' {REMOTE_ENV_FILE} | tail -n 1 | cut -d= -f2-"
		value = self.ssh_output(command).strip()
		if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
			value = value[1:-1]
		return value

	def read_database_env(self):
		pg_user = self.read_remote_env_value("PGUSER") or "retorninho"
		pg_database = self.read_remote_env_value("PGDATABASE") or "retiradas"
		pg_password = self.read_remote_env_value("PGPASSWORD")
		if not pg_password:
			raise RuntimeError(f"PGPASSWORD não encontrado em {REMOTE_ENV_FILE}.")
		return {
			"PGHOST": "127.0.0.1",
			"PGPORT": str(LOCAL_PORT),
			"PGUSER": pg_user,
			"PGPASSWORD": pg_password,
			"PGDATABASE": pg_database,
			"HUBSOFT_CANCELLATIONS_TIMEOUT_MS": "300000",
			"HUBSOFT_CANCELLATIONS_MAX_BUFFER": "209715200",
		}

	def is_port_open(self):
		try:
			with socket.create_connection(("127.0.0.1", LOCAL_PORT), timeout=1):
				return True
		except OSError:
			return False

	def open_tunnel_if_needed(self):
		if self.is_port_open():
			self.append_log(f"Túnel local já ativo em 127.0.0.1:{LOCAL_PORT}.\n")
			return

		self.append_log(f"Abrindo túnel SSH 127.0.0.1:{LOCAL_PORT} -> VPS PostgreSQL...\n")
		self.tunnel_process = subprocess.Popen(
			[
				"ssh.exe",
				"-i",
				str(SSH_KEY),
				"-N",
				"-L",
				f"{LOCAL_PORT}:127.0.0.1:5432",
				"-o",
				"ServerAliveInterval=30",
				"-o",
				"ServerAliveCountMax=10",
				SSH_TARGET,
			],
			stdout=subprocess.DEVNULL,
			stderr=subprocess.DEVNULL,
			cwd=str(REPO_ROOT),
		)

		for _ in range(15):
			time.sleep(1)
			if self.is_port_open():
				self.append_log("Túnel SSH aberto.\n")
				return
			if self.tunnel_process.poll() is not None:
				break

		raise RuntimeError("Não foi possível abrir o túnel SSH para o banco.")

	def run_node_sync(self, competencia, db_env):
		self.append_log("Consultando BI HubSoft e aplicando dados no Retiradas...\n\n")
		env = os.environ.copy()
		env.update(db_env)
		process = subprocess.Popen(
			["node.exe", str(NODE_SCRIPT), competencia],
			cwd=str(REPO_ROOT),
			env=env,
			text=True,
			encoding="utf-8",
			errors="replace",
			stdout=subprocess.PIPE,
			stderr=subprocess.STDOUT,
			bufsize=1,
		)
		for line in process.stdout:
			self.append_log(line)
		code = process.wait()
		if code != 0:
			raise RuntimeError(f"Sincronização terminou com erro. Código: {code}")

	def close_tunnel(self):
		if self.tunnel_process and self.tunnel_process.poll() is None:
			self.append_log("Fechando túnel SSH...\n")
			self.tunnel_process.terminate()
			try:
				self.tunnel_process.wait(timeout=5)
			except subprocess.TimeoutExpired:
				self.tunnel_process.kill()
		self.tunnel_process = None

	def on_close(self):
		if self.close_button["state"] == tk.DISABLED:
			messagebox.showwarning(
				"Sincronização em andamento",
				"Aguarde finalizar para fechar a janela.",
			)
			return
		self.close_tunnel()
		self.root.destroy()


if __name__ == "__main__":
	root = tk.Tk()
	app = SyncApp(root)
	root.mainloop()
