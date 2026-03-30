const links = [
  'https://shopee.co.id/product/179866429/28713293181',
  'https://shopee.co.id/product/185468564/14368750208',
  'https://shopee.co.id/product/186135622/27475892097',
  'https://shopee.co.id/product/188919201/3206498939',
  'https://shopee.co.id/product/189023764/41274257469',
  'https://shopee.co.id/product/190856783/29938946814',
  'https://shopee.co.id/product/190858629/24845230034',
  'https://shopee.co.id/product/194348172/21485154767',
  'https://shopee.co.id/product/196633341/24810682558',
  'https://shopee.co.id/product/209555652/8002355261',
  'https://shopee.co.id/product/230220445/16790488439',
  'https://shopee.co.id/product/23699131/22522456918',
  'https://shopee.co.id/product/237185879/29083778063',
  'https://shopee.co.id/product/243144646/3333025915',
  'https://shopee.co.id/product/243266654/41759609032',
  'https://shopee.co.id/product/243954977/27273318047',
  'https://shopee.co.id/product/258457179/25509175700',
  'https://shopee.co.id/product/274366338/26015158882',
  'https://shopee.co.id/product/28649863/28865710562',
  'https://shopee.co.id/product/289270692/20293817593',
  'https://shopee.co.id/product/306414198/18160111607',
  'https://shopee.co.id/product/306414198/5060295148',
  'https://shopee.co.id/product/317657437/24013522428',
  'https://shopee.co.id/product/362018996/18783959388',
  'https://shopee.co.id/product/362558172/8077768715',
  'https://shopee.co.id/product/376429801/23786774624',
  'https://shopee.co.id/product/383928813/22556817454',
  'https://shopee.co.id/product/389249461/21685524957',
  'https://shopee.co.id/product/401479341/18391934037',
  'https://shopee.co.id/product/411851571/25124082137',
  'https://shopee.co.id/product/436969432/19293141753',
  'https://shopee.co.id/product/438071925/41825891151',
  'https://shopee.co.id/product/43841210/51750699148',
  'https://shopee.co.id/product/450430857/24691408273',
  'https://shopee.co.id/product/475853955/10630290205',
  'https://shopee.co.id/product/487290229/21180336862',
  'https://shopee.co.id/product/491357860/20994505064',
  'https://shopee.co.id/product/49895774/24140677206',
  'https://shopee.co.id/product/5005398/1923491016',
  'https://shopee.co.id/product/547023793/19271948423',
  'https://shopee.co.id/product/57007792/55201046711',
  'https://shopee.co.id/product/57540496/41213921375',
  'https://shopee.co.id/product/57549845/28774907018',
  'https://shopee.co.id/product/582456000/20795095290',
  'https://shopee.co.id/product/583745065/19382212596',
  'https://shopee.co.id/product/75991220/44274812342',
  'https://shopee.co.id/product/774952772/14784816602',
  'https://shopee.co.id/product/78513186/17583809719',
  'https://shopee.co.id/product/838005794/40812782715',
  'https://shopee.co.id/product/891558906/29579765247',
  'https://shopee.co.id/product/970732672/26068964311',
  'https://shopee.co.id/product/972673667/43860289838',
  'https://shopee.co.id/product/331276635/27165973031'
];

export function getRandomAdsLink() {
  if (!links.length) return '';
  const randomIndex = Math.floor(Math.random() * links.length);
  return links[randomIndex];
}

export function openAdsLink(url, popupWindow) {
  if (!url) return;

  if (popupWindow && !popupWindow.closed) {
    popupWindow.location.href = url;
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

