import { FormularioLogin } from "./FormularioLogin";

export default function PaginaLogin() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-tinta p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <svg
          aria-hidden="true"
          viewBox="0 0 600 700"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full opacity-60"
        >
          <path
            d="M-20 330 C 120 290, 140 170, 260 180 S 420 300, 500 150 S 620 -20, 640 0"
            fill="none"
            stroke="#f26a1b"
            strokeWidth="3"
            strokeDasharray="2 12"
            strokeLinecap="round"
          />
          <g fill="#0f1b2d" stroke="#f26a1b" strokeWidth="3">
            <circle cx="260" cy="180" r="10" />
            <circle cx="500" cy="150" r="10" />
          </g>
          <circle cx="150" cy="255" r="6" fill="#1f9d6b" />
          <circle cx="400" cy="270" r="6" fill="#1f9d6b" />
        </svg>
        <p className="relative font-display text-lg font-semibold tracking-tight">Courier Local</p>
        <div className="relative max-w-md">
          <h1 className="text-5xl font-semibold leading-[1.05]">
            Cada paquete, a la puerta correcta.
          </h1>
          <p className="mt-5 text-lg text-white/70">
            Avisos por WhatsApp, rutas por sector y prueba de entrega en el mismo lugar.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-semibold lg:hidden">Courier Local</h2>
          <h2 className="mt-1 text-2xl font-semibold lg:mt-0">Entrar</h2>
          <p className="mb-6 mt-1 text-sm text-tinta-2">Usa el correo y la contraseña que te dio el administrador.</p>
          <FormularioLogin />
        </div>
      </section>
    </main>
  );
}
