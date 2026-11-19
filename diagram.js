// Mermaid source for the org chart. Edit here (or live in the app's editor panel).
window.ORG_SOURCE = String.raw`flowchart TB

    %% =====================================
    %% ESTRUTURA SUPERIOR
    %% =====================================

    DE["DIRETORIA ESTATUTÁRIA"]

    DE --> ASS["Assessor da Diretoria Estatutária"]
    DE --> CF["Conselho Fiscal"]
    DE --> SUP["SUPERINTENDÊNCIA"]

    %% =====================================
    %% ASSESSORIAS E ÁREAS DE APOIO
    %% =====================================

    SUP --> COM["Comunicação e Imprensa"]
    SUP --> QUAL["Gestão da Qualidade"]

    SUP --> OUV["Ouvidoria"]
    SUP --> COMP["Compliance"]

    SUP --> JUR["Assessoria Jurídica"]
    SUP --> PROJ["Projetos"]

    SUP --> TI["Tecnologia da Informação"]
    SUP --> SOC["Compromisso Social"]

    %% =====================================
    %% DIRETORIAS
    %% =====================================

    SUP --> DOP["DIRETORIA DE OPERAÇÕES"]
    SUP --> DMED["DIRETORIA MÉDICA"]
    SUP --> DTEC["DIRETORIA TÉCNICA"]
    SUP --> DCLI["DIRETORIA CLÍNICA"]

    %% =====================================
    %% DIRETORIA DE OPERAÇÕES
    %% =====================================

    DOP --> NIR["N.I.R"]

    DOP --> GSADT["Gestão de SADT"]
    DOP --> GCONV["Convênios"]

    GSADT --> SADT["SADT"]
    GSADT --> AMB["Gestão de Ambulatórios"]
    GSADT --> DOM["Atenção Domiciliar"]
    GSADT --> UAMB["Unidades Ambulatoriais"]
    GSADT --> SME["Serviços Médicos Externos"]

    GCONV --> CEO["C.E.O."]
    GCONV --> SAMU["S.A.M.U."]
    GCONV --> SAEC["S.A.E.C."]
    GCONV --> RAD["Radioterapia"]
    GCONV --> ESF["E.S.F. / E.A.C.S."]
    GCONV --> PAC["P.A. Central"]
    GCONV --> PAH["P.A. Hortolândia"]
    GCONV --> PAR["P.A. Retiro"]
    GCONV --> PAP["P.A. Ponte São João"]

    %% =====================================
    %% GESTÃO DE SERVIÇOS HOSPITALARES
    %% =====================================

    SUP --> GHOSP["Gestão de Serviços Hospitalares Internos"]

    GHOSP --> MAN["Manutenção"]
    GHOSP --> ENGCL["Engenharia Clínica"]
    GHOSP --> HIG["Higienização"]
    GHOSP --> ROU["Rouparia"]
    GHOSP --> CENT["Central de Serviços"]
    GHOSP --> ACESS["Controle de Acesso"]
    GHOSP --> RECEP["Recepções HSV"]
    GHOSP --> SND["S.N.D."]

    %% =====================================
    %% GESTÃO DE PESSOAS
    %% =====================================

    SUP --> GP["Gestão de Pessoas"]

    GP --> ATR["Atração e Seleção"]
    GP --> UC["Universidade Corporativa"]
    GP --> NEP["N.E.P."]
    GP --> AP["Administração de Pessoas"]
    GP --> CP["Cargos, Salários e Ponto"]
    GP --> MT["Medicina do Trabalho"]
    GP --> EST["Engenharia de Segurança do Trabalho"]

    %% =====================================
    %% GESTÃO DE CONTROLADORIA
    %% =====================================

    SUP --> GCONT["Gestão de Controladoria"]

    GCONT --> CONT["Contabilidade"]
    GCONT --> CUST["Custos / Orçamentos"]
    GCONT --> PREST["Prestação de Contas"]
    GCONT --> FIN["Financeiro"]
    GCONT --> CONVFIN["Convênios"]

    %% =====================================
    %% GESTÃO DE SUPRIMENTOS
    %% =====================================

    SUP --> GSUP["Gestão de Suprimentos"]

    GSUP --> ALM["Almoxarifado"]
    GSUP --> COMPR["Compras"]
    GSUP --> FARM["Farmácias"]
    GSUP --> LOG["Logística"]
    GSUP --> CONS["Consignados"]
    GSUP --> CAF["C.A.F."]
    GSUP --> PS["Planejamento de Suprimentos"]
    GSUP --> CONTR["Contratos"]

    %% =====================================
    %% DIRETORIA MÉDICA / GESTÃO ASSISTENCIAL
    %% =====================================

    DMED --> GASS["Gestão Assistencial"]

    GASS --> ENF["Enfermagem"]
    GASS --> REAB["Reabilitação"]
    GASS --> ORG["Captação de Órgãos"]
    GASS --> ESTOMA["Estomaterapia"]
    GASS --> SS["Serviço Social"]
    GASS --> PSICO["Psicologia"]
    GASS --> NAC["N.A.C."]

    GASS --> NVE["Núcleo de Vigilância Epidemiológica"]

    NVE --> SCIH["S.C.I.H."]
    NVE --> SAME["S.A.M.E."]
    NVE --> UCIR["Unidades Clínicas / Cirúrgicas"]
    NVE --> UTI["Unidades de UTI"]

    %% =====================================
    %% DIRETORIA TÉCNICA
    %% =====================================

    DTEC --> COMITE["Comitês e Comissões"]
    DTEC --> GCMF["Gestão de Contas Médicas / Faturamento"]

    GCMF --> FAT["Faturamento"]
    GCMF --> SAMEF["S.A.M.E."]

    %% =====================================
    %% DIRETORIA CLÍNICA
    %% =====================================

    DCLI --> CORPO["Corpo Clínico"]

    %% =====================================
    %% ESTILIZAÇÃO
    %% =====================================

    classDef estatutaria fill:#17365D,color:#fff,stroke:#10243A,stroke-width:3px
    classDef super fill:#1F4E78,color:#fff,stroke:#17365D,stroke-width:2px
    classDef diretoria fill:#156082,color:#fff,stroke:#10445B,stroke-width:2px
    classDef gestao fill:#DDEBF7,color:#17365D,stroke:#4472C4,stroke-width:1.5px
    classDef setor fill:#F2F2F2,color:#333,stroke:#999,stroke-width:1px
    classDef apoio fill:#FFF2CC,color:#7F6000,stroke:#BF9000

    class DE estatutaria
    class SUP super
    class DOP,DMED,DTEC,DCLI diretoria
    class GSADT,GCONV,GHOSP,GP,GCONT,GSUP,GASS,GCMF gestao
    class ASS,CF,COM,QUAL,OUV,COMP,JUR,PROJ,TI,SOC,NIR,COMITE,CORPO apoio
    class SADT,AMB,DOM,UAMB,SME,CEO,SAMU,SAEC,RAD,ESF,PAC,PAH,PAR,PAP,MAN,ENGCL,HIG,ROU,CENT,ACESS,RECEP,SND,ATR,UC,NEP,AP,CP,MT,EST,CONT,CUST,PREST,FIN,CONVFIN,ALM,COMPR,FARM,LOG,CONS,CAF,PS,CONTR,ENF,REAB,ORG,ESTOMA,SS,PSICO,NAC,NVE,SCIH,SAME,UCIR,UTI,FAT,SAMEF setor
`;
