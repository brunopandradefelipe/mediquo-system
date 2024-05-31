function containsWord(str, word) {
  const lowercaseStr = str.toLowerCase();
  const lowercaseWord = word.toLowerCase();
  return lowercaseStr.includes(lowercaseWord);
}

$(document).ready(function () {
  let pageUrl = window.location.href.split("/");
  pageUrl = pageUrl[pageUrl.length - 1].split(".")[0].replace(/#/g, "");
  pageUrl = pageUrl.split("?")[0];
  const anchorElements = $(".li-nav a[data-url]");

  anchorElements.each(function () {
    const dataUrl = $(this).attr("data-url");
    if (containsWord(pageUrl, dataUrl)) {
      $(this).parent().addClass("active");
    }
  });

  $(document).on("click", "#logoutSide", function () {
    $.ajax({
      url: "/api/users/logout",
      type: "GET",
      success: function (result) {
        window.location.href = "./";
      },
      error: function (result) {
        console.log(result);
      },
    });
  });
});
function getUser() {
  $.ajax({
    url: "/api/users/getuser",
    type: "GET",
    success: function (result) {
      $(".avatar-user").html(
        `<img src="./assets/images/uploads/${result.company_img}" alt="Avatar usuário">`
      );
      $(".username").html(result.first_name + " " + result.last_name);
      $(".company-user").html(result.company_name);
      const uploadLicensas = document.getElementById("uploadlicensasmenu");
      if (result.master_company == true) {
        uploadLicensas.parentNode.removeChild(uploadLicensas);
      }
    },
    error: function (result) {
      console.log(result);
    },
  });
}
getUser();
