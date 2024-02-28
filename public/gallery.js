let slideIndex = 0;
  function plusSlides(n) {showSlides(slideIndex += n);}

  function currentSlide(n) {showSlides(slideIndex = n - 1);}

  function showSlides(n) {
      const slides = document.querySelectorAll('.mySlides');
      const dots = document.querySelectorAll('.dot');

      if (n >= slides.length) slideIndex = 0;
      if (n < 0) slideIndex = slides.length - 1;
      slides.forEach((slide, index) => {
          if (index === slideIndex) slide.style.display = 'block';
          else slide.style.display = 'none';
      });

      dots.forEach((dot, index) => {
          if (index === slideIndex) dot.className = 'dot active';
          else dot.className = 'dot';
      });
  }
  showSlides(slideIndex);