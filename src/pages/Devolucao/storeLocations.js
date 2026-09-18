const RAW_STORE_LOCATIONS = [
	{
		id: "loja-abaete",
		name: "Loja Abaete",
		address: "Avenida Dr. Guido, 465, Centro, Abaete, MG - 35620000",
		mapsUrl: "https://maps.app.goo.gl/NCcpz1iJY5XbqRkd6",
	},
	{
		id: "loja-aguanil",
		name: "Loja Aguanil",
		address: "R. Dolores Silva, 44, Centro, Aguanil, MG - 37273000",
		mapsUrl: "https://maps.app.goo.gl/LEJbf3GXKaQkQ5WH7",
	},
	{
		id: "loja-araujos",
		name: "Loja Araujos",
		address: "Avenida Brasil, 1251, Centro, Araujos, MG - 35603000",
		mapsUrl: "https://maps.app.goo.gl/pLBXGjP6W3HtKnSp8",
	},
	{
		id: "loja-arcos",
		name: "Loja Arcos",
		address: "Av. Magalhaes Pinto, 618, Centro, Arcos, MG - 35598003",
		mapsUrl: "https://maps.app.goo.gl/6V7bnqYhYQ64hXCo9",
	},
	{
		id: "loja-belo-vale",
		name: "Loja Belo Vale",
		address: "Rua Goncalo Alvares, 285, Centro, Belo Vale, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/ZyuRrNmA9xLNXp87A",
	},
	{
		id: "loja-bom-despacho",
		name: "Loja Bom Despacho",
		address:
			"Rua Clodoaldo De Oliveira, 326, Centro, Bom Despacho, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/fQd2oQvtd7uWBnWD9",
	},
	{
		id: "loja-bom-sucesso",
		name: "Loja Bom Sucesso",
		address: "Praca Getulio Vargas, 139 B, Centro, Bom Sucesso, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/NwBmSTqVmyNJzXLt6",
	},
	{
		id: "loja-brumadinho",
		name: "Loja Brumadinho",
		address: "Avenida Vigilato Braga, 386, Centro, Brumadinho, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/BB1DDTiW3RExYs219",
	},
	{
		id: "loja-campo-belo",
		name: "Loja Campo Belo",
		address:
			"Rua Santos Dumont, 432 Sala 102, Centro, Campo Belo, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/WGGAZgtQWCdP6aVR8",
	},
	{
		id: "loja-cana-verde",
		name: "Loja Cana Verde",
		address:
			"Rua Carmelita Carvalho Garcia, 175, Centro, Cana Verde, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/JKKmdvVnY5Nok3WH6",
	},
	{
		id: "loja-candeias",
		name: "Loja Candeias",
		address:
			"Avenida Dezessete De Dezembro, 517, Centro, Candeias, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/qxZy3bKfoXDB1Peo7",
	},
	{
		id: "loja-capim-branco",
		name: "Loja Capim Branco",
		address:
			"Avenida Jk, 13 A Em Frente Ao Posto Jj., Centro, Capim Branco, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/Kxmyqp2Pia1CzS6E9",
	},
	{
		id: "loja-carmo-da-cachoeira",
		name: "Loja Carmo da Cachoeira",
		address:
			"Rua Dr. Veiga Lima, 868, Centro, Carmo Da Cachoeira, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/xmAbefmzFiZ4KQfw6",
	},
	{
		id: "loja-carmo-da-mata",
		name: "Loja Carmo da Mata",
		address: "Rua Antonio Notini, 50, Centro, Carmo Da Mata, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/rYap33UzAVdijUak8",
	},
	{
		id: "loja-carmopolis",
		name: "Loja Carmopolis",
		address: "Rua Padre Francisco, 121, Centro, Carmopolis, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/GUSmuZKmXNjXDWLHA",
	},
	{
		id: "loja-carrancas",
		name: "Loja Carrancas",
		address: "Avenida Brasil, 251 A, Centro, Carrancas, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/eCYTYTosrQs2Mk479",
	},
	{
		id: "loja-casa-branca-brumadinho",
		name: "Loja Casa Branca/Brumadinho",
		address:
			"Avenida Casa Branca, 128 Loja 2, Galeria Comercial Casa Branca, Casa Branca/brumadinho, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/BzB2Q75howDPMkrq8",
	},
	{
		id: "loja-claudio",
		name: "Loja Claudio",
		address: "Praca Levy Vitoi Freitas, 6, Centro, Claudio, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/8wwhev4FCBrquz9J8",
	},
	{
		id: "loja-cordisburgo",
		name: "Loja Cordisburgo",
		address: "Avenida Padre Joao, 1408, Centro, Cordisburgo, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/n8aAEJV7K9FuGue9A",
	},
	{
		id: "loja-cristais",
		name: "Loja Cristais",
		address:
			"Avenida Francisco De Assis Carvalho, 199b, Centro, Cristais, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/D7hPrdMPXHqbsFxA7",
	},
	{
		id: "loja-divinopolis",
		name: "Loja Divinopolis",
		address:
			"Rua Goias, 211 Galeria Central, Centro, Divinopolis, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/PCv6LVjdNj43bWyA7",
	},
	{
		id: "loja-formiga",
		name: "Loja Formiga",
		address: "Rua Barao De Piumhi, 267, Centro, Formiga, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/aLvy5h82uw5GWQns6",
	},
	{
		id: "loja-igarape",
		name: "Loja Igarape",
		address: "Rua Joao Rosa, 288, Centro, Igarape, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/azX4k286hnJJUkbf9",
	},
	{
		id: "loja-igaratinga",
		name: "Loja Igaratinga",
		address: "Rua Antonio Mendes, 412, Centro, Igaratinga, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/vytM7jbnmcuemTEB9",
	},
	{
		id: "loja-iguatama",
		name: "Loja Iguatama",
		address: "Rua Cinco, 440, Centro, Iguatama, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/gkEXVYFHx9yaqAmW7",
	},
	{
		id: "loja-ijaci",
		name: "Loja Ijaci",
		address: "Rua Pedro De Oliveira, 35, Centro, Ijaci, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/HtyW1P5xkGsP257H7",
	},
	{
		id: "loja-itapecerica",
		name: "Loja Itapecerica",
		address:
			"Praca Dom Jose Medeiros Leite, 109, Centro, Itapecerica, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/yBH9uUxQPSAPQhgP6",
	},
	{
		id: "loja-itumirim",
		name: "Loja Itumirim",
		address:
			"Praca Jose Antonio De Mesquita, 34, Centro, Itumirim, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/gd9MrkvG8PAWryDGA",
	},
	{
		id: "loja-itutinga",
		name: "Loja Itutinga",
		address: "Rua Antenor Augusto, 40, Centro, Itutinga, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/ymP47QkhgRSrfesEA",
	},
	{
		id: "loja-jaboticatubas",
		name: "Loja Jaboticatubas",
		address:
			"Rua Carlos Vasconcelos, 502 Cx 1, Centro, Jaboticatubas, MG - 35830000",
		mapsUrl: "https://maps.app.goo.gl/h6rR7PHt4vYVHqhX8",
	},
	{
		id: "loja-japaraiba",
		name: "Loja Japaraiba",
		address: "Rua Sao Simao, 312, Centro, Japaraiba, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/PASTKsfjJGXow3He7",
	},
	{
		id: "loja-jequitiba",
		name: "Loja Jequitiba",
		address: "MG 238, 291 1º Andar, Centro, Jequitiba, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/9P1sBhsCU72w35CWA",
	},
	{
		id: "loja-juatuba",
		name: "Loja Juatuba",
		address: "Rua Tanus Saliba, 303, Centro, Juatuba, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/BFQGCTCTzBUM9q4s9",
	},
	{
		id: "loja-lagoa-da-prata",
		name: "Loja Lagoa da Prata",
		address:
			"Rua Luiz Guadalupe, 311 Sala 3 E 4, Centro, Lagoa Da Prata, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/2Lp7DBxZzYmXXM4p7",
	},
	{
		id: "loja-lavras",
		name: "Loja Lavras",
		address: "Rua Chagas Doria, 26, Centro, Lavras, MG - 00000000",
		mapsUrl: "https://g.co/kgs/LFN6iV5",
	},
	{
		id: "loja-martinho-campos",
		name: "Loja Martinho Campos",
		address:
			"Praca Governador Valadares, 340a, Centro, Martinho Campos, MG - 00000000",
		mapsUrl:
			"https://www.google.com/maps/place/Pra%C3%A7a+Gov.+Valadares,+340+-+Centro,+Martinho+Campos+-+MG,+35606-000/@-19.3329619,-45.2421651,17z/data=!3m1!4b1!4m6!3m5!1s0x94b2dc6ea201a8d9:0xcafef7c49db48179!8m2!3d-19.332962!4d-45.2372996!16s%2Fg%2F11f159tg5m?entry=ttu",
	},
	{
		id: "loja-mateus-leme",
		name: "Loja Mateus Leme",
		address: "Rua Pereira Guimaraes, 50, Centro, Mateus Leme, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/DvvCQfj99E9PJBmaA",
	},
	{
		id: "loja-nazareno",
		name: "Loja Nazareno",
		address:
			"Praca Nossa Senhora De Nazare, 166, Centro, Nazareno, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/E37oRyK9ETjjptT69",
	},
	{
		id: "loja-nepomuceno",
		name: "Loja Nepomuceno",
		address:
			"Avenida Monsenhor Luiz Gonzaga, 455 B, Centro, Nepomuceno, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/YED549teUadKu5cL8",
	},
	{
		id: "loja-oliveira",
		name: "Loja Oliveira",
		address: "Rua Da Misericordia, 212, Centro, Oliveira, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/MznReLuB9Zp8YKzW8",
	},
	{
		id: "loja-pains",
		name: "Loja Pains",
		address: "Rua Presidente Tancredo Neves, 87, Centro, Pains, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/1jJh5pFT4o9DFPXx6",
	},
	{
		id: "loja-para-de-minas",
		name: "Loja Para de Minas",
		address:
			"Rua Antonio Rocha, 423 Loja 1, Dom Bosco, Para De Minas, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/ZN4pFaBM7g3fuYt17",
	},
	{
		id: "loja-pedra-do-indaia",
		name: "Loja Pedra do Indaia",
		address: "Rua Nova, 51, Centro, Pedra Do Indaia, MG - 00000000",
		mapsUrl:
			"https://www.google.com/maps/place/R.+Nova,+51+-+Centro,+Pedra+do+Indai%C3%A1+-+MG,+35565-970/@-20.2573949,-45.2110719,17z/data=!3m1!4b1!4m6!3m5!1s0x94b4b94022b35d21:0x160f05b5fd45b53d!8m2!3d-20.2574!4d-45.206201!16s%2Fg%2F11gf9l2vsz?entry=tts",
	},
	{
		id: "loja-perdigao",
		name: "Loja Perdigao",
		address: "Avenida Dom Cristiano, 945, Centro, Perdigao, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/Zdv9YQBTtkBnPwDy8",
	},
	{
		id: "loja-perdoes",
		name: "Loja Perdoes",
		address: "Rua Joao Carlos De Resende, 32, Centro, Perdoes, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/R5H5ekgtdmN9WD9N7",
	},
	{
		id: "loja-pitangui",
		name: "Loja Pitangui",
		address: "Rua Coronel Jose Saldanha, 85a, Centro, Pitangui, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/cFtypMbUS5xZqJge6",
	},
	{
		id: "loja-piumhi",
		name: "Loja Piumhi",
		address: "Praca Zeca Soares, 312, Centro, Piumhi, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/UTPLbGffz1PPsMnBA",
	},
	{
		id: "loja-santana-de-pirapama",
		name: "Loja Santana de Pirapama",
		address:
			"Rua Antonio Quintino, 16, Centro, Santana De Pirapama, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/7xnZhX6jcb9BwPoS9",
	},
	{
		id: "loja-santana-do-jacare",
		name: "Loja Santana do Jacare",
		address:
			"Avenida Magalhaes Pinto, 176 Loja 04, Centro, Santana Do Jacare, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/3j9vMhhj2LQ6nsbaA",
	},
	{
		id: "loja-santo-antonio-do-amparo",
		name: "Loja Santo Antonio do Amparo",
		address:
			"Praca Governador Valadares, 27, Centro, Santo Antonio Do Amparo, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/jf8UqfLSrnufrd3q9",
	},
	{
		id: "loja-santo-antonio-do-monte",
		name: "Loja Santo Antonio do Monte",
		address:
			"Praca Getulio Vargas, 149, Centro, Santo Antonio Do Monte, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/1Ba1Yu3Ja3z2fJLu8",
	},
	{
		id: "loja-sao-francisco-de-paula",
		name: "Loja Sao Francisco de Paula",
		address:
			"Praca Pedro Severino Aguiar, 632, Centro, Sao Francisco De Paula, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/buMKWRYxS3hDZPFfA",
	},
	{
		id: "loja-sao-goncalo-do-para",
		name: "Loja Sao Goncalo do Para",
		address:
			"Rua Coronel Pedro Teixeira Menezes, 160, Centro, Sao Goncalo Do Para, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/g41Jfe4in1AUh9ih9",
	},
	{
		id: "loja-sao-joaquim-de-bicas",
		name: "Loja Sao Joaquim de Bicas",
		address:
			"Avenida Dr. Rossini De Minas, 425 Loja, Tereza Cristina, Sao Joaquim De Bicas, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/DTbrDvHP4aPmCiyr8",
	},
	{
		id: "loja-sao-jose-do-almeida-jaboticatubas",
		name: "Loja Sao Jose do Almeida/Jaboticatubas",
		address:
			"Avenida Vereador Candido Martins, 205 Galeria Central, Centro, Sao Jose Do Almeida/jaboticatubas, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/kmdvz4h5bHCfVjQJA",
	},
	{
		id: "loja-sao-thome-das-letras",
		name: "Loja Sao Thome das Letras",
		address:
			"Praca Do Rosario, 605, Rosario, Sao Thome Das Letras, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/ULH9dvho7Y9tPXPN8",
	},
	{
		id: "loja-sao-tiago",
		name: "Loja Sao Tiago",
		address:
			"Praca Ministro Gabriel Passos, 210 Sala 101, Centro, Sao Tiago, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/j8DDLkh2SCNzk3vy7",
	},
	{
		id: "loja-sarzedo",
		name: "Loja Sarzedo",
		address: "Rua Dos Rodoviarios, 44, Centro, Sarzedo, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/BoBsoWsnJ3Adj84v9",
	},
	{
		id: "loja-sete-lagoas",
		name: "Loja Sete Lagoas",
		address: "Praca Alexandre Lanza, 94, Centro, Sete Lagoas, MG - 00000000",
		mapsUrl: "https://maps.app.goo.gl/TjBEXHj5EVBKgJa2A",
	},
	{
		id: "loja-tres-coracoes",
		name: "Loja Tres Coracoes",
		address:
			"Avenida Presidente Getulio Vargas, 145 Lj A, Centro, Tres Coracoes, MG - 37410137",
		mapsUrl: "https://maps.app.goo.gl/3djJCMtySxVqEi1w9",
	},
];

function extractCityFromAddress(address) {
	const parts = address
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	const stateIndex = parts.findIndex((item) => /MG(\s*-\s*\d+)?$/i.test(item));
	if (stateIndex > 0) return `${parts[stateIndex - 1]} - MG`;
	return "Minas Gerais";
}

function extractCepFromAddress(address) {
	const match = String(address || "").match(/MG\s*-\s*(\d{8})/i);
	if (!match) return "";
	return match[1] === "00000000" ? "" : match[1];
}

export const STORE_LOCATIONS = RAW_STORE_LOCATIONS.map((store) => ({
	...store,
	type: "Loja Sempre",
	city: extractCityFromAddress(store.address),
	cep: extractCepFromAddress(store.address),
	phone: "0800 300 0800",
	hours: "Consulte horarios e disponibilidade pelos canais oficiais da Sempre.",
	notes: "Endereco publicado na pagina Nossas Lojas da Sempre Internet.",
	mapsQuery: store.address,
}));
