const Spinner = ({ fullScreen = false }) => {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50"
        style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-[3px] border-[var(--b)] border-t-[var(--orange)] animate-spin" />
          <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Carregando...</p>
        </div>
      </div>
    );
  }
  return (
    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin inline-block" />
  );
};

export default Spinner;
