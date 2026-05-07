import Link from "next/link";

const areas = [
  {
    slug: "programacion",
    title: "Programación",
    desc: "Code review, debugging, arquitectura, frameworks, despliegue.",
    icon: "</>",
    grad: "from-[#5b8cff] to-[#22d3ee]",
  },
  {
    slug: "seguridad",
    title: "Seguridad informática",
    desc: "Hardening, pentesting básico, OWASP, auth, criptografía aplicada.",
    icon: "🛡",
    grad: "from-[#7b5bff] to-[#ef4444]",
  },
];

const roles = [
  {
    role: "cliente",
    label: "Soy cliente",
    desc: "Necesito una asesoría ahora.",
  },
  {
    role: "asesor",
    label: "Soy asesor",
    desc: "Estoy disponible para atender.",
  },
];

export default function Home() {
  return (
    <div className="px-6 max-w-6xl mx-auto">
      <section className="pt-12 pb-10">
        <div className="chip mb-5">
          <span className="dot dot-ok" />
          Asesoría 1 a 1 por videollamada
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
          Conecta cara a cara con un experto en{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: "linear-gradient(135deg,#5b8cff,#7b5bff)",
            }}
          >
            programación
          </span>{" "}
          o{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: "linear-gradient(135deg,#7b5bff,#ef4444)",
            }}
          >
            seguridad informática
          </span>
          .
        </h1>
        <p className="mt-4 text-muted max-w-2xl">
          Elige tu rol y el área. Te emparejamos con la persona del otro lado y
          se ven al instante. Sin instalar nada — solo navegador con cámara y
          micrófono.
        </p>
      </section>

      <section id="areas" className="grid gap-4 sm:grid-cols-2">
        {areas.map((a) => (
          <div key={a.slug} className="glass rounded-2xl p-6">
            <div
              className={`inline-flex w-12 h-12 items-center justify-center rounded-xl text-white font-bold bg-gradient-to-br ${a.grad}`}
            >
              {a.icon}
            </div>
            <h2 className="mt-4 text-xl font-semibold">{a.title}</h2>
            <p className="mt-1 text-sm text-muted">{a.desc}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {roles.map((r) => (
                <Link
                  key={r.role}
                  href={`/sala?area=${a.slug}&rol=${r.role}`}
                  className={r.role === "cliente" ? "btn btn-primary" : "btn btn-ghost"}
                >
                  {r.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section id="como-funciona" className="mt-14 glass rounded-2xl p-6">
        <h3 className="text-lg font-semibold">¿Cómo funciona?</h3>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
          <li className="rounded-xl p-4 bg-white/5 border border-white/5">
            <span className="text-accent font-semibold">1.</span> Eliges área y
            rol (cliente o asesor).
          </li>
          <li className="rounded-xl p-4 bg-white/5 border border-white/5">
            <span className="text-accent font-semibold">2.</span> Te buscamos a
            la contraparte que esté en línea en esa misma área.
          </li>
          <li className="rounded-xl p-4 bg-white/5 border border-white/5">
            <span className="text-accent font-semibold">3.</span> Se establece
            la videollamada P2P con WebRTC, cifrada extremo a extremo.
          </li>
        </ol>
      </section>
    </div>
  );
}
