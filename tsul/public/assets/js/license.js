$(document).ready(function () {
  $("#InputTell").mask("(00) 0 0000-0000");
  $("#InputCPF").mask("000.000.000-00");

  function validarCampo(campo, validador) {
    if (validador(campo.val())) {
      campo.removeClass("is-invalid");
      campo.siblings(".invalid-feedback").text("");
      return true;
    } else {
      $(".btn-save-license").prop('disabled', false);
      $(".btn-save-license").html(`Salvar`);
      campo.addClass("is-invalid");
      campo
        .siblings(".invalid-feedback")
        .text("Campo inválido. Preencha corretamente.");
      return false;
    }
  }

  function validarNome(nome) {
    return nome.trim() !== "";

  }

  function validarUltimoNome(nome) {
    return nome.trim() !== "";
  }

  function validarEmail(email) {
    return email.trim() !== "";
  }

  function validarTelefone(telefone) {
    return telefone.trim() !== "";
  }

  function validarCpf(telefone) {
    return telefone.trim() !== "";
  }

  function validarDepartament(telefone) {
    return telefone.trim() !== "";
  }

  function validarFormulario() {
    var isPrimeiroNome = validarCampo($("#InputFirstName"), validarNome);
    var isUltimoNome = validarCampo($("#InputLastName"), validarUltimoNome);
    var isEmailValido = validarCampo($("#InputEmail"), validarEmail);
    var isTelefoneValido = validarCampo($("#InputTell"), validarTelefone);
    var isCpfValido = validarCampo($("#InputCPF"), validarCpf);
    var isDepartamentoValido = validarCampo($("#InputDepartamento"), validarDepartament);

    return (
      isPrimeiroNome &&
      isUltimoNome &&
      isEmailValido &&
      isTelefoneValido &&
      isCpfValido &&
      isDepartamentoValido
    );
  }

  $(".btn-save-license").on("click", function (e) {
    $(this).prop('disabled', true);
    $(this).html(`<i class="fas fa-spinner fa-pulse"></i>`);
    var primeiroNome = $("#InputFirstName").val();
    var ultimoNome = $("#InputLastName").val();
    var email = $("#InputEmail").val();
    var telefone = $("#InputTell").val().replace(/\D/g, '');;
    var cpf = $("#InputCPF").val().replace(/\D/g, '');;
    var departament = $("#InputDepartamento").val();
    e.preventDefault();
    if (validarFormulario()) {
      $.ajax({
        url: "/api/mediquo/activation-codes",
        type: "POST",
        dataType: "json",
        data: JSON.stringify({
          first_name: primeiroNome,
          last_name: ultimoNome,
          email: email,
          phone_number: telefone,
          phone_prefix: "55",
          code: cpf,
          departament: departament,
        }),
        contentType: "application/json",
        success: function (result) {
          $(".btn-save-license").prop('disabled', false);
          $(".btn-save-license").html(`Salvar`);
          Swal.fire({
            icon: "success",
            title: result.message,
            showConfirmButton: false,
            timer: 1500,
          }).then(function () {
            window.location.href = './users';
          });
        },
        error: function (result) {
          $(".btn-save-license").prop('disabled', false);
          $(".btn-save-license").html(`Salvar`);
          Swal.fire({
            icon: "error",
            title: result.responseJSON.message,
            showConfirmButton: false,
            timer: 1500,
          });
        },
      });
    }
  });
});
