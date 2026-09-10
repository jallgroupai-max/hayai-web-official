/* Configuracion editable del sitio.
   Se carga antes que la app y NO requiere tocar /src ni regenerar nada.

   whatsapp     Numero en formato internacional sin '+' ni espacios (ej. "584121234567").
                Si esta definido, el formulario de contacto entrega el mensaje por WhatsApp.
   email        Correo de contacto. Se usa como salida alternativa si no hay whatsapp.
   leadEndpoint URL opcional que reciba el lead por POST JSON. Si esta definida tiene
                prioridad sobre whatsapp/email: el formulario espera la respuesta HTTP
                real y solo confirma si el servidor responde 2xx.

   Si los tres quedan vacios el formulario valida pero avisa de que el canal no esta
   configurado: nunca simula un envio correcto. */
window.HAYAI_CONFIG = {
  whatsapp: "",
  email: "",
  leadEndpoint: ""
};
