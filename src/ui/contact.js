/**
 * Formulario de contacto.
 *
 * El canal de salida se decide en /config.js y hay tres, por orden de prioridad:
 *   1. leadEndpoint  POST JSON real. Sólo confirma si el servidor responde 2xx.
 *   2. whatsapp      Abre wa.me con el mensaje ya compuesto.
 *   3. email         Abre el cliente de correo con el mensaje ya compuesto.
 *
 * Si no hay ninguno configurado el envío queda deshabilitado con un aviso
 * explícito: el formulario nunca dice "enviado" sin que haya salido nada.
 */
import { $, el } from '../dom.js';
import { CATEGORIES, DIAL_CODES, categoryById } from '../data.js';
import { getState, subscribe } from '../store.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const RESUBMIT_GUARD = 2500; // ms

/** @returns {{whatsapp:string, email:string, leadEndpoint:string}} */
function config() {
  const raw = window.HAYAI_CONFIG || {};
  return {
    whatsapp: String(raw.whatsapp || '').replace(/[^\d]/g, ''),
    email: String(raw.email || '').trim(),
    leadEndpoint: String(raw.leadEndpoint || '').trim()
  };
}

export function initContact() {
  const form = $('[data-lead-form]');
  if (!form) return;

  const chipsHost = $('[data-type-chips]');
  const dial = $('[data-dial]');
  const status = $('[data-form-status]');
  const note = $('[data-form-note]');
  const submit = $('[data-submit]');
  const submitLabel = $('[data-submit-label]');
  const formTitle = $('[data-form-title]');
  const directHost = $('[data-direct-channels]');

  const cfg = config();
  const channel = cfg.leadEndpoint ? 'endpoint' : cfg.whatsapp ? 'whatsapp' : cfg.email ? 'email' : null;

  let selected = new Set();
  let pending = false;
  let lastSubmitAt = 0;

  /* ── Canales directos ─────────────────────────────────────────────────── */

  const direct = [];
  if (cfg.whatsapp) {
    direct.push(
      el('a', { href: `https://wa.me/${cfg.whatsapp}`, target: '_blank', rel: 'noopener noreferrer' }, [
        document.createTextNode(`WhatsApp +${cfg.whatsapp}`),
        el('span', { class: 'arrow', 'aria-hidden': 'true', text: '↗' })
      ])
    );
  }
  if (cfg.email) {
    direct.push(el('a', { href: `mailto:${cfg.email}` }, [document.createTextNode(cfg.email)]));
  }
  if (direct.length) directHost.replaceChildren(...direct);

  /* ── Códigos de país ──────────────────────────────────────────────────── */

  dial.replaceChildren(
    ...DIAL_CODES.map((code) => el('option', { value: code.value, text: code.label }))
  );
  dial.value = DIAL_CODES[0].value;

  /* ── Chips de tipo de proyecto ────────────────────────────────────────── */

  const chips = CATEGORIES.map((category) => {
    const chip = el('button', {
      class: 'chip',
      type: 'button',
      'aria-pressed': 'false',
      'data-cat': category.id,
      text: category.short
    });
    chip.addEventListener('click', () => {
      if (selected.has(category.id)) selected.delete(category.id);
      else selected.add(category.id);
      paintChips();
      clearError('types');
    });
    return chip;
  });
  chipsHost.append(...chips);

  function paintChips() {
    for (const chip of chips) chip.setAttribute('aria-pressed', String(selected.has(chip.dataset.cat)));
  }

  function syncWithFilter() {
    const filter = getState().filter;
    const category = filter ? categoryById(filter) : null;
    formTitle.textContent = category ? category.formTitle : '¿Tienes un proyecto similar?';
    // Preselecciona la categoría que el visitante está mirando, sin borrar lo suyo.
    if (filter && !selected.size) {
      selected = new Set([filter]);
      paintChips();
    }
  }

  syncWithFilter();
  subscribe((_, changed) => {
    if (changed.has('filter')) syncWithFilter();
  });

  /* ── Estado y errores ─────────────────────────────────────────────────── */

  function setStatus(kind, content) {
    if (!kind) {
      status.removeAttribute('data-kind');
      status.replaceChildren();
      return;
    }
    status.setAttribute('data-kind', kind);
    status.replaceChildren(...(Array.isArray(content) ? content : [document.createTextNode(content)]));
  }

  function setError(name, message) {
    const target = $(`[data-error-for="${name}"]`);
    if (target) target.textContent = message || '';
    const field = $(`[data-field="${name}"]`);
    if (field) field.dataset.invalid = message ? 'true' : 'false';
    const input = field && field.querySelector('input, textarea');
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function clearError(name) {
    setError(name, '');
  }

  function clearAllErrors() {
    ['types', 'phone', 'email', 'idea'].forEach(clearError);
  }

  for (const name of ['phone', 'email', 'idea']) {
    const field = $(`[data-field="${name}"]`);
    const input = field && field.querySelector('input, textarea');
    if (input) input.addEventListener('input', () => clearError(name));
  }

  /* ── Canal no configurado ─────────────────────────────────────────────── */

  if (!channel) {
    submit.disabled = true;
    submit.setAttribute('aria-disabled', 'true');
    setStatus(
      'pending',
      'El canal de envío todavía no está configurado en config.js (whatsapp, email o leadEndpoint). ' +
        'Hasta entonces este formulario no puede entregar el mensaje.'
    );
    note.textContent = 'Configura config.js para activar el envío.';
  } else if (channel === 'whatsapp') {
    note.textContent = 'Te llevamos a WhatsApp con el mensaje ya escrito.';
  } else if (channel === 'email') {
    note.textContent = 'Abrimos tu cliente de correo con el mensaje ya escrito.';
  }

  /* ── Envío ────────────────────────────────────────────────────────────── */

  function readForm() {
    const phoneRaw = form.elements.phone.value.trim();
    return {
      types: [...selected].map((id) => (categoryById(id) || {}).title).filter(Boolean),
      typeIds: [...selected],
      dial: dial.value,
      phone: phoneRaw,
      fullPhone: `${dial.value} ${phoneRaw}`.trim(),
      email: form.elements.email.value.trim(),
      idea: form.elements.idea.value.trim()
    };
  }

  function validate(data) {
    clearAllErrors();
    let firstInvalid = null;

    if (!data.typeIds.length) {
      setError('types', 'Selecciona al menos un tipo de proyecto.');
      firstInvalid = firstInvalid || chips[0];
    }
    if (data.phone.replace(/\D/g, '').length < 7) {
      setError('phone', 'Escribe un teléfono válido.');
      firstInvalid = firstInvalid || form.elements.phone;
    }
    if (!EMAIL_RE.test(data.email)) {
      setError('email', 'Revisa el formato del correo.');
      firstInvalid = firstInvalid || form.elements.email;
    }
    if (data.idea.length < 10) {
      setError('idea', 'Cuéntanos un poco más (mínimo 10 caracteres).');
      firstInvalid = firstInvalid || form.elements.idea;
    }
    return firstInvalid;
  }

  function compose(data) {
    return [
      'Hola HAYAI, quiero hablar de un proyecto.',
      '',
      `Tipo: ${data.types.join(', ')}`,
      `Teléfono: ${data.fullPhone}`,
      `Correo: ${data.email}`,
      '',
      'Idea:',
      data.idea
    ].join('\n');
  }

  function setPending(value) {
    pending = value;
    submit.disabled = value;
    submit.setAttribute('aria-disabled', String(value));
    submitLabel.textContent = value ? 'Enviando…' : 'Hablemos de tu proyecto';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !channel) return;
    // Protección contra envíos duplicados por doble clic o doble Enter.
    if (Date.now() - lastSubmitAt < RESUBMIT_GUARD) return;

    const data = readForm();
    const invalid = validate(data);
    if (invalid) {
      setStatus('error', 'Revisa los campos marcados antes de enviar.');
      invalid.focus({ preventScroll: false });
      return;
    }

    lastSubmitAt = Date.now();
    setStatus(null);

    if (channel === 'endpoint') {
      setPending(true);
      setStatus('pending', 'Enviando tu mensaje…');
      try {
        const response = await fetch(cfg.leadEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            source: 'hayai.com.ve',
            types: data.types,
            phone: data.fullPhone,
            email: data.email,
            idea: data.idea,
            sentAt: new Date().toISOString()
          })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setStatus('ok', 'Mensaje recibido. Te respondemos con una propuesta de alcance y siguiente paso.');
        // Los campos sólo se limpian cuando el envío se ha confirmado.
        form.reset();
        dial.value = DIAL_CODES[0].value;
        selected = new Set();
        paintChips();
      } catch (error) {
        setStatus('error', `No pudimos enviar el mensaje (${error.message}). Inténtalo de nuevo en un momento.`);
      } finally {
        setPending(false);
      }
      return;
    }

    const body = compose(data);

    if (channel === 'whatsapp') {
      const url = `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(body)}`;
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (opened) {
        setStatus('ok', 'Te llevamos a WhatsApp con el mensaje listo. Sólo tienes que pulsar enviar allí.');
      } else {
        // Sin ventana no hay entrega: se ofrece el enlace en vez de confirmar.
        setStatus('error', [
          document.createTextNode('Tu navegador bloqueó la ventana. '),
          el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: 'Abre WhatsApp aquí' }),
          document.createTextNode(' para enviar el mensaje.')
        ]);
      }
      return;
    }

    const subject = `Nuevo proyecto — ${data.types.join(', ')}`;
    const mailto = `mailto:${cfg.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setStatus('ok', [
      document.createTextNode('Abrimos tu cliente de correo con el mensaje listo. Si no se abrió, '),
      el('a', { href: mailto, text: 'ábrelo aquí' }),
      document.createTextNode('.')
    ]);
  });

  /* ── Año del pie ──────────────────────────────────────────────────────── */
  const year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
}
