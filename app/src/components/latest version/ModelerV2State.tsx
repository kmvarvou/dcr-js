import { useState, useEffect, useRef } from 'react';
import { StateProps, StateEnum } from '../App';
import ModelerV2 from './ModelerV2';
import TopRightIcons from '../utilComponents/TopRightIcons';
import { BiHome, BiPlus, BiSave, BiLeftArrowCircle, BiAnalyse, BiSolidDashboard } from 'react-icons/bi';
import ModalMenu, { ModalMenuElement } from '../utilComponents/ModalMenu';
import FileUpload from '../utilComponents/FileUpload';
import StyledFileUpload from '../utilComponents/StyledFileUpload';
import GraphNameInput from '../utilComponents/GraphNameInput';
import FullScreenIcon from '../utilComponents/FullScreenIcon';
import MenuElement from '../utilComponents/MenuElement';
import Label from '../utilComponents/Label';
import Toggle from '../utilComponents/Toggle';
import DropDown from '../utilComponents/DropDown';
import { toast } from 'react-toastify';
import { loadDCRFromXML } from '../utils/dcrToReactFlow';
import { Node, Edge } from 'reactflow';
import Examples from './Examples';
import { isSettingsVal } from '../types';

const initGraphName = "DCR-JS Graph V2";

const ModelerV2State = ({ setState, savedGraphs, setSavedGraphs, lastSavedGraph }: StateProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [graphName, setGraphName] = useState<string>(lastSavedGraph.current || initGraphName);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [xmlContent, setXmlContent] = useState<string>('');
  const edgesRef = useRef<Edge[]>([]);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [examplesData, setExamplesData] = useState<Array<string>>([]);

  useEffect(() => {
    // Fetch examples
    fetch('/dcr-js/examples/generated_examples.txt')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch examples status code: ' + response.status);
        }
        return response.text();
      })
      .then(data => {
        let files = data.split('\n');
        files.pop(); // Remove last empty line
        files = files.map(name => name.split('.').slice(0, -1).join('.')); // Shave file extension off
        setExamplesData(files);
      })
      .catch(err => console.error('Failed to load examples:', err));
  }, []);

  // Load XML and convert to React Flow format
  const loadXML = async (xmlString: string, filename?: string) => {
    try {
      const { nodes, edges } = await loadDCRFromXML(xmlString);
      console.log('Loaded from XML:', { nodes: nodes.length, edges: edges.length });
      console.log('Nodes:', nodes);
      console.log('Edges:', edges);
      setNodes(nodes);
      setEdges(edges);
      setXmlContent(xmlString);
      if (filename) {
        setGraphName(filename.replace('.xml', ''));
      }
      toast.success('Graph loaded successfully!');
    } catch (error) {
      console.error('Error loading XML:', error);
      toast.error('Failed to load XML file');
    }
  };

  // Save current graph to savedGraphs
  const saveGraph = () => {
    if (!xmlContent) {
      toast.error('No graph to save. Please load an XML file first.');
      return;
    }
    const newSavedGraphs = { ...savedGraphs };
    newSavedGraphs[graphName] = serializeXML(xmlContent);
    setSavedGraphs(newSavedGraphs);
    lastSavedGraph.current = graphName;
    toast.success(`Graph saved as "${graphName}"`);
  };

  // Download XML
  const downloadXML = () => {
    if (!xmlContent) {
      toast.error('No graph to download');
      return;
    }
    const blob = new Blob([serializeXML(xmlContent)], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${graphName}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // New diagram - clear everything
  const newDiagram = () => {
    setNodes([]);
    setEdges([]);
    setXmlContent('');
    setGraphName(initGraphName);
  };

  // Serialize current edges (with delay/deadline) back into the XML string
  const serializeXML = (xml: string): string => {
    const currentEdges = edgesRef.current;
    let result = xml;

    // Collect all guards to write as <expression> elements
    const expressions: { id: string; value: string }[] = [];

    for (const edge of currentEdges) {
      const delay = (edge.data as any)?.delay;
      const deadline = (edge.data as any)?.deadline;
      const timeVal = delay ?? deadline;
      const guard: string | undefined = (edge.data as any)?.guard;

      // --- time attribute (Editor format) ---
      result = result.replace(
        new RegExp(`(<dcr:relation[^>]*id="${edge.id}"[^>]*?)\s*time="[^"]*"`, 'g'),
        '$1'
      );
      if (timeVal != null) {
        result = result.replace(
          new RegExp(`(<dcr:relation[^>]*id="${edge.id}"[^>]*?)\s*\/>`),
          `$1 time="${timeVal}"/>`
        );
      }

      // --- guard (Editor format: expressionId attribute on dcr:relation) ---
      // Strip existing expressionId first
      result = result.replace(
        new RegExp(`(<dcr:relation[^>]*id="${edge.id}"[^>]*?)\s*expressionId="[^"]*"`, 'g'),
        '$1'
      );
      if (guard) {
        const exprId = `${edge.id}--guard`;
        expressions.push({ id: exprId, value: guard });
        result = result.replace(
          new RegExp(`(<dcr:relation[^>]*id="${edge.id}"[^>]*?)\s*\/>`),
          `$1 expressionId="${exprId}"/>`
        );
      }
    }

    // Write expression elements into <expressions> block (Editor format)
    if (expressions.length > 0) {
      const nl = '\n';
      const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/</g, '&lt;');
      const exprLines = expressions.map(e => '    <dcr:expression id="' + e.id + '" value="' + escapeXml(e.value) + '"/>');
      const exprXml = exprLines.join(nl);
      if (result.includes('<dcr:expressions>')) {
        // Strip existing guard expressions we own then re-add
        result = result.replace(/<dcr:expression id="[^"]*--guard"[^/]*\/>\n?/g, '');
        result = result.replace('</dcr:expressions>', exprXml + nl + '  </dcr:expressions>');
      } else if (result.includes('</dcr:dcrGraph>')) {
        result = result.replace(
          '</dcr:dcrGraph>',
          '  <dcr:expressions>' + nl + exprXml + nl + '  </dcr:expressions>' + nl + '</dcr:dcrGraph>'
        );
      }
    }

    return result;
  };

  // Layout graph (placeholder)
  const layout = () => {
    toast.info('Auto-layout not yet implemented for React Flow modeler');
  };

  // Menu elements for saved graphs
  const savedGraphElements = () => {
    return Object.keys(savedGraphs).length > 0 ? [{
      text: "Saved Graphs:",
      elements: Object.keys(savedGraphs).map(name => ({
        icon: <BiLeftArrowCircle />,
        text: name,
        onClick: () => { 
          loadXML(savedGraphs[name], name); 
          setMenuOpen(false);
        },
      }))
    }] : [];
  };

  const menuElements: Array<ModalMenuElement> = [
    {
      icon: <BiPlus />,
      text: "New Diagram",
      onClick: () => { 
        newDiagram();
        setMenuOpen(false);
      },
    },
    {
      icon: <BiSave />,
      text: "Save Graph",
      onClick: () => { 
        saveGraph(); 
        setMenuOpen(false);
      },
    },
    {
      text: "Open",
      elements: [
        {
          customElement: (
            <StyledFileUpload>
              <FileUpload 
                accept="text/xml" 
                fileCallback={(name, contents) => { 
                  loadXML(contents, name); 
                  setMenuOpen(false); 
                }}
              >
                <div />
                <>Open DCR XML</>
              </FileUpload>
            </StyledFileUpload>
          ),
        },
      ]
    },
    {
      text: "Download",
      elements: [{
        icon: <div />,
        text: "Download Editor XML",
        onClick: () => { 
          downloadXML(); 
          setMenuOpen(false);
        },
      },
      {
        icon: <div />,
        text: "Download DCR Solutions XML",
        onClick: () => { 
          downloadXML(); 
          setMenuOpen(false);
        },
      },
      {
        icon: <div />,
        text: "Download SVG",
        onClick: () => { 
          toast.info("TODO: Implement export as SVG with React Flow");
          setMenuOpen(false);
        },
      }],
    },
    {
      icon: <BiSolidDashboard />,
      text: "Examples",
      onClick: () => { setMenuOpen(false); setExamplesOpen(true) },
    },
    ...savedGraphElements(),
  ];

  const bottomElements: Array<ModalMenuElement> = [
    {
      customElement:
        <MenuElement>
          <Toggle initChecked={true} onChange={(e) => {
            toast.info("TODO: Implement coloured relations setting with React Flow");
          }} />
          <Label>Coloured Relations</Label>
        </MenuElement>
    },
    {
      customElement:
        <MenuElement>
          <DropDown
            options={[
              { title: "TAL2023", value: "TAL2023", tooltip: "https://link.springer.com/chapter/10.1007/978-3-031-46846-9_12" }, 
              { title: "HM2011", value: "HM2011", tooltip: "https://arxiv.org/abs/1110.4161" }, 
              { title: "DCR Solutions", value: "DCR Solutions", tooltip: "https://dcrsolutions.net/" }
            ]}
            onChange={(option) => {
              toast.info("TODO: Implement relation notation setting with React Flow");
            }}
          />
          <Label>Relation Notation</Label>
        </MenuElement>
    }
  ];

  return (
    <>
      <GraphNameInput
        value={graphName}
        onChange={e => setGraphName(e.target.value)}
      />
      
      <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
        {/* Main ModelerV2 component with loaded data */}
        <ModelerV2 nodes={nodes} edges={edges} edgesRef={edgesRef} />
      </div>

      <TopRightIcons>
        <BiAnalyse title="Layout Graph" onClick={layout} />
        <FullScreenIcon />
        <BiHome onClick={() => setState(StateEnum.Home)} />
        <ModalMenu elements={menuElements} bottomElements={bottomElements} open={menuOpen} setOpen={setMenuOpen} />
      </TopRightIcons>

      {examplesOpen && <Examples
        examplesData={examplesData}
        openCustomXML={(xml) => loadXML(xml)}
        openDCRXML={(xml) => loadXML(xml)}
        setExamplesOpen={setExamplesOpen}
        setLoading={() => {}}
      />}
    </>
  );
};

export default ModelerV2State;
